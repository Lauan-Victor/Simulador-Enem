const sessionValue = sessionStorage.getItem("simulaEnemSession");

if (!sessionValue) {
	window.location.replace("index.html");
} else {
	const questionBank = [];
	const questionYears = [2015, 2016, 2017, 2018, 2019, 2020, 2022, 2023, 2024, 2025];
	const setupPanel = document.querySelector("#setup-panel");
	const runPanel = document.querySelector("#run-panel");
	const resultPanel = document.querySelector("#result-panel");
	const configForm = document.querySelector("#exam-config");
	const subjectField = document.querySelector("#subject-field");
	const subjectSelect = document.querySelector("#subject-select");
	const hoursSelect = document.querySelector("#duration-hours");
	const minutesSelect = document.querySelector("#duration-minutes");
	const loadStatus = document.querySelector("#load-status");
	const startButton = document.querySelector("#start-exam");
	const answers = new Map();
	let examQuestions = [];
	let currentIndex = 0;
	let remainingSeconds = 0;
	let timerInterval;

	function normalizeText(text) {
		return text.replace(/\s+/g, " ").trim();
	}

	function areaFromHeading(text, offset, questionNumber) {
		const beforeQuestion = text.slice(0, offset);
		const areaPatterns = [
			{ name: "Linguagens", pattern: /^\s*LINGUAGENS,?\s*C[ÓO]DIGOS\b/gim },
			{ name: "Ciências humanas", pattern: /^\s*CI[ÊE]NCIAS\s+HUMANAS\b/gim },
			{ name: "Ciências da natureza", pattern: /^\s*CI[ÊE]NCIAS\s+DA\s+NATUREZA\b/gim },
			{ name: "Matemática", pattern: /^\s*MATEM[ÁA]TICA\b/gim },
		];
		let latestArea;
		let latestPosition = -1;

		areaPatterns.forEach(({ name, pattern }) => {
			for (const match of beforeQuestion.matchAll(pattern)) {
				if (match.index > latestPosition) {
					latestPosition = match.index;
					latestArea = name;
				}
			}
		});

		if (latestArea) {
			return latestArea;
		}
		if (questionNumber <= 45) return "Linguagens";
		if (questionNumber <= 90) return "Ciências humanas";
		if (questionNumber <= 135) return "Ciências da natureza";
		return "Matemática";
	}

	function parseAnswerKey(text) {
		const answersByNumber = new Map();
		for (const match of text.matchAll(/^\s*(\d{1,3})\s+([A-E])(?:\s+([A-E]))?/gim)) {
			const number = Number(match[1]);
			const answers = answersByNumber.get(number) || [];
			answers.push(...[match[2], match[3]].filter(Boolean).map((answer) => answer.toUpperCase()));
			answersByNumber.set(number, answers);
		}
		return answersByNumber;
	}

	function parseChoices(lines) {
		const candidates = [];
		lines.forEach((line, index) => {
			const match = line.trim().match(/^([A-E])(?:[.)]\s*|\s+)(\S.*)$/);
			if (match) {
				candidates.push({ letter: match[1], text: match[2], index });
			}
		});

		let bestSequence;
		candidates.forEach((candidate, start) => {
			if (candidate.letter !== "A") return;
			const sequence = [candidate];
			let nextLetterIndex = 1;
			for (let index = start + 1; index < candidates.length && nextLetterIndex < 5; index += 1) {
				if (candidates[index].letter === "ABCDE"[nextLetterIndex]) {
					sequence.push(candidates[index]);
					nextLetterIndex += 1;
				}
			}
			if (sequence.length === 5 && (!bestSequence
				|| sequence[4].index - sequence[0].index < bestSequence[4].index - bestSequence[0].index)) {
				bestSequence = sequence;
			}
		});

		if (!bestSequence) return null;
		const choices = bestSequence.map((choice, index) => {
			const end = bestSequence[index + 1]?.index ?? lines.length;
			const continuation = lines.slice(choice.index + 1, end).join(" ");
			return {
				letter: choice.letter,
				text: normalizeText(`${choice.text} ${continuation}`),
			};
		});
		return choices.every((choice) => choice.text)
			? { choices, firstChoiceIndex: bestSequence[0].index }
			: null;
	}

	function parseQuestionFile(text, year, answerKey) {
		const marker = /^\s*(?:QUEST(?:ÃO|AO)\s*0*(\d{1,3})|0*(\d{1,3})\s+QUEST(?:ÃO|AO))\b.*$/gim;
		const headers = [...text.matchAll(marker)];
		const questions = [];
		const seenNumbers = new Set();
		const occurrences = new Map();

		headers.forEach((header, index) => {
			const number = Number(header[1] || header[2]);
			if (!number || seenNumbers.has(number)) return;
			const occurrence = occurrences.get(number) || 0;
			occurrences.set(number, occurrence + 1);
			const start = header.index + header[0].length;
			const end = headers[index + 1]?.index ?? text.length;
			const lines = text.slice(start, end).split(/\r?\n/);
			const firstContentLine = lines.find((line) => line.trim()) || "";
			const imageNotice = /\b(?:tem|cont[ée]m|contendo)\s+(?:uma\s+)?imagem|\(\s*(?:in?magem|tem\s+imagem|imagem\s+nas\s+respostas)\b|\bimagem\s+nas\s+respostas\b/i;
			if (imageNotice.test(header[0]) || imageNotice.test(firstContentLine)) return;

			const parsedChoices = parseChoices(lines);
			const possibleAnswers = answerKey.get(number) || [];
			const correctAnswer = possibleAnswers[Math.min(occurrence, possibleAnswers.length - 1)];
			if (!parsedChoices || !correctAnswer
				|| !parsedChoices.choices.some((choice) => choice.letter === correctAnswer)) return;

			const statement = normalizeText(lines.slice(0, parsedChoices.firstChoiceIndex).join(" "));
			if (!statement) return;

			questions.push({
				id: `${year}-${number}`,
				year,
				number,
				area: areaFromHeading(text, header.index, number),
				statement,
				choices: parsedChoices.choices,
				correctAnswer,
				difficulty: "Média",
				complexity: `${statement} ${parsedChoices.choices.map((choice) => choice.text).join(" ")}`.split(/\s+/).length,
			});
			seenNumbers.add(number);
		});

		return questions;
	}

	function classifyDifficulty(questions) {
		const sorted = [...questions].sort((first, second) => first.complexity - second.complexity);
		sorted.forEach((question, index) => {
			const percentile = index / Math.max(sorted.length, 1);
			question.difficulty = percentile < 0.3 ? "Fácil" : percentile < 0.7 ? "Média" : "Difícil";
		});
	}

	async function loadQuestionBank() {
		const files = await Promise.all(questionYears.map(async (year) => {
			const [questionResponse, answerResponse] = await Promise.all([
				fetch(`prova-${year}`),
				fetch(`gabarito-${year}`),
			]);
			if (!questionResponse.ok || !answerResponse.ok) {
				throw new Error(`Não foi possível carregar as questões de ${year}.`);
			}
			const [questionText, answerText] = await Promise.all([
				questionResponse.text(),
				answerResponse.text(),
			]);
			return parseQuestionFile(questionText, year, parseAnswerKey(answerText));
		}));

		files.forEach((questions) => questionBank.push(...questions));
		classifyDifficulty(questionBank);
		if (!questionBank.length) {
			throw new Error("Nenhuma questão sem aviso de imagem e com alternativas e gabarito disponíveis foi encontrada.");
		}
	}

	function selectedPool() {
		const scope = configForm.elements.scope.value;
		return questionBank.filter((question) => scope === "all" || question.area === subjectSelect.value);
	}

	function selectedDurationMinutes() {
		return Number(hoursSelect.value) * 60 + Number(minutesSelect.value);
	}

	function updateEstimate() {
		minutesSelect.disabled = hoursSelect.value === "12";
		if (minutesSelect.disabled) minutesSelect.value = "0";
		const duration = selectedDurationMinutes();
		const count = Math.floor(duration / 4);
		const hours = Math.floor(duration / 60);
		const minutes = duration % 60;
		const readableDuration = `${hours}h${minutes ? ` ${String(minutes).padStart(2, "0")}min` : ""}`;
		document.querySelector("#question-estimate").innerHTML =
			`<strong>${count} questões estimadas</strong> <span>·</span> ${readableDuration}`;
	}

	function shuffle(items) {
		const shuffled = [...items];
		for (let index = shuffled.length - 1; index > 0; index -= 1) {
			const otherIndex = Math.floor(Math.random() * (index + 1));
			[shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
		}
		return shuffled;
	}

	function formatTime(seconds) {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const remaining = seconds % 60;
		return [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
	}

	function renderQuestion() {
		const question = examQuestions[currentIndex];
		document.querySelector("#current-number").textContent = currentIndex + 1;
		document.querySelector("#progress-label").textContent = `Questão ${currentIndex + 1} de ${examQuestions.length}`;
		document.querySelector("#difficulty-badge").textContent = `${question.difficulty} estimada`;
		document.querySelector("#difficulty-badge").dataset.difficulty = question.difficulty.toLowerCase();
		document.querySelector("#question-source").textContent =
			`${question.area} · Prova ${question.year} · Questão ${String(question.number).padStart(2, "0")}`;
		document.querySelector("#question-statement").textContent = question.statement;
		document.querySelector("#answer-options").replaceChildren(...question.choices.map((choice) => {
			const label = document.createElement("label");
			label.className = "answer-option";
			const input = document.createElement("input");
			input.type = "radio";
			input.name = "answer";
			input.value = choice.letter;
			input.checked = answers.get(question.id) === choice.letter;
			input.addEventListener("change", () => answers.set(question.id, choice.letter));
			const letter = document.createElement("span");
			letter.className = "answer-letter";
			letter.textContent = choice.letter;
			const text = document.createElement("span");
			text.className = "answer-text";
			text.textContent = choice.text;
			label.append(input, letter, text);
			return label;
		}));
		document.querySelector("#previous-question").disabled = currentIndex === 0;
		document.querySelector("#next-question").hidden = currentIndex === examQuestions.length - 1;
	}

	function finishExam() {
		window.clearInterval(timerInterval);
		setupPanel.hidden = true;
		runPanel.hidden = true;
		resultPanel.hidden = false;

		const missedEasy = examQuestions.filter((question) =>
			question.difficulty === "Fácil" && answers.has(question.id) && answers.get(question.id) !== question.correctAnswer).length;
		const missedMedium = examQuestions.filter((question) =>
			question.difficulty === "Média" && answers.has(question.id) && answers.get(question.id) !== question.correctAnswer).length;
		const correctHard = examQuestions.filter((question) =>
			question.difficulty === "Difícil" && answers.get(question.id) === question.correctAnswer);
		const guessPattern = missedEasy > 0 && missedMedium > 0 && correctHard.length > 0;
		const invalidatedHard = guessPattern ? correctHard.length : 0;
		const rawCorrect = examQuestions.filter((question) => answers.get(question.id) === question.correctAnswer).length;
		const validCorrect = rawCorrect - invalidatedHard;
		const answered = answers.size;
		const total = examQuestions.length;

		document.querySelector("#result-summary").textContent =
			`${validCorrect} acertos considerados de ${total} questões · ${answered} respondidas · ${total - answered} em branco.`;
		document.querySelector("#result-breakdown").innerHTML = `
			<div><span>Acertos antes da análise</span><strong>${rawCorrect}</strong></div>
			<div><span>Fáceis erradas</span><strong>${missedEasy}</strong></div>
			<div><span>Médias erradas</span><strong>${missedMedium}</strong></div>
			<div><span>Difíceis desconsideradas</span><strong>${invalidatedHard}</strong></div>
		`;
		document.querySelector("#result-note").textContent = guessPattern
			? "Como houve erro em questões fáceis e médias e acerto em difíceis, os acertos difíceis foram desconsiderados como possíveis chutes."
			: "Nenhum padrão de acerto no chute foi identificado. As questões corretas foram consideradas.";
	}

	function startExam() {
		const pool = selectedPool();
		if (!pool.length) {
			loadStatus.textContent = "Não há questões disponíveis para essa matéria no acervo sem imagens.";
			loadStatus.hidden = false;
			return;
		}

		const requestedCount = Math.floor(selectedDurationMinutes() / 4);
		const actualCount = Math.min(requestedCount, pool.length);
		examQuestions = shuffle(pool).slice(0, actualCount);
		if (actualCount < requestedCount) {
			remainingSeconds = actualCount * 4 * 60;
		} else {
			remainingSeconds = selectedDurationMinutes() * 60;
		}
		currentIndex = 0;
		setupPanel.hidden = true;
		runPanel.hidden = false;
		document.querySelector("#run-kicker").textContent = configForm.elements.scope.value === "all"
			? "SIMULADO COMPLETO"
			: `SIMULADO · ${subjectSelect.value.toUpperCase()}`;
		renderQuestion();
		document.querySelector("#timer").textContent = formatTime(remainingSeconds);
		timerInterval = window.setInterval(() => {
			remainingSeconds -= 1;
			document.querySelector("#timer").textContent = formatTime(remainingSeconds);
			if (remainingSeconds <= 0) finishExam();
		}, 1000);
	}

	document.querySelectorAll('input[name="scope"]').forEach((input) => {
		input.addEventListener("change", () => {
			subjectField.hidden = input.value !== "single";
		});
	});
	configForm.addEventListener("change", updateEstimate);
	configForm.addEventListener("submit", (event) => {
		event.preventDefault();
		startExam();
	});
	document.querySelector("#next-question").addEventListener("click", () => {
		if (currentIndex < examQuestions.length - 1) {
			currentIndex += 1;
			renderQuestion();
		}
	});
	document.querySelector("#previous-question").addEventListener("click", () => {
		if (currentIndex > 0) {
			currentIndex -= 1;
			renderQuestion();
		}
	});
	document.querySelector("#finish-exam").addEventListener("click", finishExam);
	updateEstimate();

	loadQuestionBank().then(() => {
		startButton.disabled = false;
		startButton.textContent = "Começar simulado";
		startButton.insertAdjacentHTML("beforeend", ' <span aria-hidden="true">&#8594;</span>');
		loadStatus.textContent = `${questionBank.length} questões disponíveis sem indicação de imagem.`;
		loadStatus.hidden = false;
	}).catch((error) => {
		loadStatus.textContent = `Não foi possível carregar o banco de questões: ${error.message}`;
		loadStatus.hidden = false;
		startButton.textContent = "Questões indisponíveis";
	});
}
