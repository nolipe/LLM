# Gerador de Questoes de Revisao com LLM

Projeto desenvolvido para a atividade de Fundamentos de Inteligencia Artificial.

## Objetivo

Esta aplicacao ajuda alunos a estudarem para provas. O usuario informa um tema, escolhe a quantidade de questoes e o nivel de dificuldade. O sistema envia esses dados para um modelo de linguagem via OpenRouter e retorna questoes de multipla escolha. O gabarito fica oculto ate o usuario responder e pedir a correcao.

## Funcionalidades

- Recebe um tema de estudo informado pelo usuario.
- Permite escolher entre 3 e 10 questoes.
- Permite escolher nivel iniciante, intermediario ou avancado.
- Envia a entrada para modelos gratuitos do OpenRouter, com fallback se algum estiver em limite temporario.
- Exibe apenas as questoes geradas na tela.
- Permite que o usuario marque as respostas.
- Mostra o gabarito comentado somente depois da correcao.
- Mantem a chave da API protegida no arquivo `.env`.

## Como instalar

1. Instale o Node.js.
2. Abra a pasta do projeto no terminal.
3. Execute:

```bash
npm install
```

## Como configurar a chave

Crie um arquivo chamado `.env` na raiz do projeto.

Dentro dele, coloque:

```env
OPENROUTER_API_KEY=sua_chave_aqui
```

Troque `sua_chave_aqui` pela sua chave real do OpenRouter.

Opcionalmente, voce pode definir a ordem dos modelos no `.env`:

```env
OPENROUTER_MODELS=openai/gpt-oss-20b:free,qwen/qwen3-next-80b-a3b-instruct:free,meta-llama/llama-3.3-70b-instruct:free
```

Se um modelo gratuito retornar limite temporario, o servidor tenta o proximo da lista.

Importante: nao coloque a chave dentro do `server.js` nem dentro da pasta `public`.

## Como executar

No terminal, execute:

```bash
npm start
```

Depois acesse no navegador:

```text
http://localhost:3000
```

## Estrutura do projeto

```text
gerador-questoes-revisao/
  package.json
  server.js
  .env
  .env.example
  public/
    index.html
```

## Exemplo de uso

Tema: APIs REST

Quantidade: 5

Nivel: iniciante

Saida esperada: o sistema gera questoes de multipla escolha sobre APIs REST. Depois que o usuario responde, a aplicacao mostra quantidade de acertos, gabarito e comentario explicativo.
