import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
const PORT = 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "openai/gpt-oss-120b:free";
const LETRAS = ["A", "B", "C", "D"];

if (!API_KEY) {
  console.error("Erro: configure OPENROUTER_API_KEY no arquivo .env.");
  process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/status", (req, res) => {
  res.json({ status: "API local funcionando", model: MODEL });
});

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

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-OpenRouter-Title": "Gerador de Questoes FIA ADS"
      },
      body: JSON.stringify({
        model: MODEL,
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
        temperature: 0.2,
        max_completion_tokens: 1600
      })
    });

    if (!response.ok) {
      const detalhe = await response.text();
      return res.status(502).json({
        erro: "Erro ao consultar o OpenRouter.",
        status: response.status,
        detalhe
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(502).json({ erro: "Resposta vazia ou inesperada." });
    }

    let resultado;
    try {
      resultado = JSON.parse(text);
    } catch (error) {
      return res.status(502).json({ erro: "A IA respondeu em um formato invalido. Tente novamente." });
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

    res.json({ modelo: MODEL, questoes: questoesValidas, uso: data.usage ?? null });
  } catch (error) {
    res.status(500).json({ erro: "Erro interno no servidor.", detalhe: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
