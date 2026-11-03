# Simulador-Enem

link oficial para provas e gabaritos:
https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos

Os arquivos locais das provas ficam em `provas/` e os gabaritos correspondentes em `gabaritos/`.

## Como usar

Sirva os arquivos por um servidor HTTP local (por exemplo, `python3 -m http.server`) e abra `index.html`. O acesso de demonstração é `teste@simulaenem.com`, senha `enem2026`. Depois do login, a página inicial oferece o simulado e o perfil.

O simulado começa com 6 horas e 90 questões, calculadas a 4 minutos por questão. É possível escolher de 4 a 12 horas, todas as áreas ou uma área específica. Ao iniciar, a prova abre em tela cheia; a primeira saída gera uma advertência e a segunda zera o resultado. As questões são carregadas dos arquivos de provas e gabaritos disponíveis no repositório, embaralhadas e incluem também as que indicam imagem. Quando houver um arquivo correspondente em `imagens-questoes/`, ele é exibido junto ao enunciado.

A classificação fácil, média ou difícil é uma estimativa inicial baseada na extensão do enunciado e das alternativas, não uma classificação oficial do ENEM. Se houver erro em questões fáceis e médias e acerto em questões difíceis, esses acertos difíceis são sinalizados e desconsiderados no resultado como possíveis chutes.
