// Sugestões de resposta com IA gratuita: GitHub Models, usando o GITHUB_TOKEN
// que o próprio Actions fornece (permissão "models: read"). Sem custo: o plano
// gratuito tem limite de pedidos por dia; ao passar dele, ou em qualquer erro,
// volta para os modelos de texto prontos. A IA só SUGERE: nada sai sem as regras
// de aprovação de scripts/comentarios.mjs.
import { problemaResposta } from "./comentarios.mjs";

const URL_MODELOS = "https://models.github.ai/inference/chat/completions";

const SISTEMA = `Você responde comentários do canal "Mente de Milhão", de educação financeira no YouTube Shorts, em português do Brasil.
Regras:
- Resposta curta: no máximo 2 frases e 280 caracteres. Tom simpático e direto. No máximo 1 emoji.
- NUNCA recomende investimento, produto, banco, corretora, ativo ou valor específico. NUNCA prometa rentabilidade.
- Em perguntas sobre dinheiro: dê só a ideia geral e educativa e diga que depende do objetivo, prazo e reserva de emergência de cada um.
- Sem links, sem @menções, sem pedir contato, sem dados pessoais.
- Se o comentário for ofensivo, responda com educação e sem discutir.
- Não invente fatos sobre o vídeo além do título informado.
Responda só com o texto da resposta.`;

export class IA {
  constructor({ token = process.env.GITHUB_TOKEN, modelo = "openai/gpt-4o-mini", maxPorExecucao = 30, fetch: f = globalThis.fetch, desligada = process.env.IA_RESPOSTAS === "desligada" } = {}) {
    this.token = token;
    this.modelo = modelo;
    this.restantes = maxPorExecucao;
    this.fetch = f;
    this.ativa = Boolean(token) && !desligada;
    this.motivoParada = this.ativa ? null : token ? "desligada" : "sem GITHUB_TOKEN";
  }

  /** Devolve um texto sugerido, ou null para usar o modelo pronto. */
  async sugerir({ texto, categoria, tituloVideo }) {
    if (!this.ativa || this.restantes <= 0 || categoria === "spam") return null;
    this.restantes--;
    try {
      const r = await this.fetch(URL_MODELOS, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          model: this.modelo,
          temperature: 0.6,
          max_tokens: 160,
          messages: [
            { role: "system", content: SISTEMA },
            { role: "user", content: `Vídeo: "${tituloVideo ?? "sem título"}"\nTipo do comentário: ${categoria}\nComentário: """${String(texto).slice(0, 1000)}"""` },
          ],
        }),
      });
      if (r.status === 429 || r.status === 401 || r.status === 403) {
        this.ativa = false;
        this.motivoParada = r.status === 429 ? "limite gratuito do dia" : "sem permissão models: read";
        return null;
      }
      if (!r.ok) return null;
      const j = await r.json();
      return limparSugestao(j.choices?.[0]?.message?.content);
    } catch {
      return null;
    }
  }
}

/** Corta e filtra a saída da IA; devolve null se não servir. */
export function limparSugestao(t) {
  if (!t) return null;
  let s = String(t).trim().replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ");
  if (/https?:|www\.|@\w/.test(s)) return null;
  if (/\b(compre|venda|invista em|aplique em|garantid[oa])\b/i.test(s)) return null;
  if (s.length > 300) s = `${s.slice(0, 297).replace(/\s+\S*$/, "")}…`;
  return problemaResposta(s) ? null : s;
}
