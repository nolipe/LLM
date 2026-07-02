import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
const PORT = 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODELS = (process.env.OPENROUTER_MODELS || process.env.OPENROUTER_MODEL || [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free"
].join(","))
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const LETRAS = ["A", "B", "C", "D"];

if (!API_KEY) {
  console.error("Erro: configure OPENROUTER_API_KEY no arquivo .env.");
  process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/status", (req, res) => {
  res.json({ status: "API local funcionando", models: MODELS });
});

function extrairMensagemOpenRouter(detalhe) {
  try {
    return JSON.parse(detalhe)?.error?.message || detalhe;
  } catch (error) {
    return detalhe;
  }
}

async function consultarOpenRouter(model, prompt) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-OpenRouter-Title": "Gerador de Questoes FIA ADS"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Voce e um professor de ADS que cria questoes de revisao objetivas, corretas e bem comentadas. Sempre responda no formato JSON solicitado."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_completion_tokens: 2200,
      response_format: { type: "json_object" }
    })
  });
}

function extrairJson(texto) {
  const limpo = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(limpo);
  } catch (error) {
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");

    if (inicio === -1 || fim === -1 || fim <= inicio) {
      throw error;
    }

    return JSON.parse(limpo.slice(inicio, fim + 1));
  }
}

function textoValido(valor, minimo = 8) {
  return typeof valor === "string" && valor.trim().length >= minimo;
}

function limparTexto(valor) {
  return valor.trim().replace(/\s+/g, " ");
}

function alternativaProibida(texto) {
  const normalizado = texto.toLowerCase();
  return normalizado.includes("todas as anteriores")
    || normalizado.includes("nenhuma das anteriores")
    || normalizado.includes("todas estao corretas")
    || normalizado.includes("todas estão corretas");
}

function normalizarQuestao(questao) {
  if (!questao || typeof questao !== "object") {
    return null;
  }

  const alternativas = questao.alternativas || {};
  const correta = typeof questao.correta === "string" ? questao.correta.trim().toUpperCase() : "";
  const explicacoes = questao.explicacoes || {};

  if (!textoValido(questao.enunciado, 15) || !LETRAS.includes(correta)) {
    return null;
  }

  const alternativasNormalizadas = {};
  const explicacoesNormalizadas = {};
  const textosAlternativas = new Set();

  for (const letra of LETRAS) {
    if (!textoValido(alternativas[letra], 4) || !textoValido(explicacoes[letra], 20)) {
      return null;
    }

    const textoAlternativa = limparTexto(alternativas[letra]);

    if (alternativaProibida(textoAlternativa) || textosAlternativas.has(textoAlternativa.toLowerCase())) {
      return null;
    }

    textosAlternativas.add(textoAlternativa.toLowerCase());
    alternativasNormalizadas[letra] = textoAlternativa;
    explicacoesNormalizadas[letra] = limparTexto(explicacoes[letra]);
  }

  return {
    enunciado: limparTexto(questao.enunciado),
    alternativas: alternativasNormalizadas,
    correta,
    explicacoes: explicacoesNormalizadas
  };
}

app.post("/api/questoes", async (req, res) => {
  try {
    const { tema, quantidade, nivel } = req.body;

    if (!tema || tema.trim().length === 0) {
      return res.status(400).json({ erro: "Informe um tema para gerar as questoes." });
    }

    if (tema.length > 300) {
      return res.status(400).json({ erro: "O tema deve ter no maximo 300 caracteres." });
    }

    const total = Number(quantidade || 5);
    if (!Number.isInteger(total) || total < 3 || total > 10) {
      return res.status(400).json({ erro: "A quantidade deve estar entre 3 e 10." });
    }

    const nivelEscolhido = ["iniciante", "intermediario", "avancado"].includes(nivel)
      ? nivel
      : "iniciante";

    const prompt = `
Crie ${total} questoes de revisao sobre o tema "${tema.trim()}" para alunos de ADS.
Nivel das questoes: ${nivelEscolhido}.

Responda somente com JSON valido, sem markdown e sem texto fora do JSON.

Formato obrigatorio:
{
  "questoes": [
    {
      "enunciado": "texto da pergunta",
      "alternativas": {
        "A": "texto da alternativa",
        "B": "texto da alternativa",
        "C": "texto da alternativa",
        "D": "texto da alternativa"
      },
      "correta": "A",
      "explicacoes": {
        "A": "explique se esta alternativa esta certa ou errada e por que",
        "B": "explique se esta alternativa esta certa ou errada e por que",
        "C": "explique se esta alternativa esta certa ou errada e por que",
        "D": "explique se esta alternativa esta certa ou errada e por que"
      }
    }
  ]
}

Regras:
- Use linguagem clara e didatica.
- Evite questoes ambiguas.
- Nao invente conceitos inexistentes.
- Cada questao deve ter exatamente uma alternativa correta.
- A letra correta deve ser apenas A, B, C ou D.
- A alternativa marcada em "correta" precisa estar realmente correta.
- As outras tres alternativas precisam estar claramente erradas, mas plausiveis.
- As explicacoes devem justificar cada alternativa, nao apenas repetir o texto da alternativa.
- Nao use alternativas como "todas as anteriores" ou "nenhuma das anteriores".
- Nao repita alternativas com o mesmo significado.
- Misture questoes teoricas e praticas quando fizer sentido.
- Antes de responder, confira se todas as questoes tem uma alternativa certa e tres erradas.
`;

    let response;
    let modelUsado;
    const errosOpenRouter = [];

    for (const model of MODELS) {
      response = await consultarOpenRouter(model, prompt);
      modelUsado = model;

      if (response.ok) {
        break;
      }

      const detalhe = await response.text();
      errosOpenRouter.push({
        model,
        status: response.status,
        detalhe: extrairMensagemOpenRouter(detalhe)
      });

      if (![429, 503, 529].includes(response.status)) {
        break;
      }
    }

    if (!response?.ok) {
      const ultimoErro = errosOpenRouter.at(-1);
      const rateLimit = errosOpenRouter.some((erro) => erro.status === 429);
      return res.status(502).json({
        erro: rateLimit
          ? "O OpenRouter aceitou sua chave, mas os modelos gratuitos estao com limite temporario. Tente novamente em instantes ou configure outro modelo em OPENROUTER_MODELS."
          : "Erro ao consultar o OpenRouter.",
        status: ultimoErro?.status,
        detalhe: ultimoErro?.detalhe,
        tentativas: errosOpenRouter
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(502).json({ erro: "Resposta vazia ou inesperada." });
    }

    let resultado;
    try {
      resultado = extrairJson(text);
    } catch (error) {
      console.error("Resposta invalida da IA:", text.slice(0, 500));
      return res.status(502).json({
        erro: "A IA respondeu em um formato invalido. Tente novamente.",
        modelo: modelUsado
      });
    }

    if (!Array.isArray(resultado.questoes) || resultado.questoes.length === 0) {
      return res.status(502).json({ erro: "A IA nao retornou questoes validas." });
    }

    const questoesValidas = resultado.questoes
      .map(normalizarQuestao)
      .filter(Boolean)
      .slice(0, total);

    if (questoesValidas.length < total) {
      return res.status(502).json({
        erro: "A IA gerou algumas questoes inconsistentes. Clique em gerar novamente."
      });
    }

    res.json({ modelo: modelUsado, questoes: questoesValidas, uso: data.usage ?? null });
  } catch (error) {
    res.status(500).json({ erro: "Erro interno no servidor.", detalhe: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
