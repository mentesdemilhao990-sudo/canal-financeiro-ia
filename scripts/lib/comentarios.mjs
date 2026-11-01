// Classifica comentários e sugere respostas, só com regras (sem IA paga).
//
// Categorias:
//   simples    elogio/agradecimento curto, sem pergunta -> pode ter resposta automática (se ligada)
//   financeira pergunta ou pedido sobre dinheiro/investimento -> SEMPRE revisão humana
//   pergunta   outra pergunta -> sugestão, aguarda aprovação
//   negativo   crítica/ofensa -> sugestão, aguarda aprovação
//   spam       link, contato, autopromoção -> sem sugestão, recomenda ignorar
//   outro      o resto -> sugestão, aguarda aprovação
import { semAcento } from "./metadata.mjs";

const norm = (s) => ` ${semAcento(String(s)).toLowerCase().replace(/[^a-z0-9?!@#$%]+/g, " ").replace(/\s+/g, " ")} `;
const tem = (t, lista) => lista.some((p) => t.includes(` ${p} `) || (p.endsWith("*") && t.includes(` ${p.slice(0, -1)}`)));

const FINANCAS = [
  "investir", "invisto", "investimento*", "aplicar", "aplico", "aplicacao", "render", "rende", "rendimento*", "juros", "cdb", "cdi",
  "lci", "lca", "tesouro", "selic", "poupanca", "acao", "acoes", "bolsa", "dividendo*", "fii", "fiis", "cripto*", "bitcoin",
  "dolar", "renda fixa", "renda variavel", "corretora", "banco", "nubank", "inter", "previdencia", "aposentadoria",
  "imposto", "ir", "divida*", "emprestimo*", "financiamento", "financiar", "cartao", "credito", "consorcio", "reserva",
  "salario", "dinheiro", "reais", "r$", "%", "carteira", "patrimonio", "fundo*", "inflacao", "ipca", "quitar", "pagar",
];
const PERGUNTA = ["como", "qual", "quais", "quanto", "quantos", "onde", "quando", "porque", "por que", "vale a pena", "devo", "compensa", "melhor", "indica", "recomenda", "sabe", "pode", "tem como", "ajuda"];
const ELOGIO = [
  "top", "otimo", "excelente", "show", "muito bom", "mt bom", "parabens", "obrigado", "obrigada", "valeu", "amei", "adorei",
  "gostei", "incrivel", "sensacional", "perfeito", "massa", "brabo", "conteudo bom", "bom demais", "que video", "explicacao",
  "didatico", "aprendi", "sucesso", "maravilhoso", "excelente conteudo", "bom video", "boa", "gratidao", "salvou",
];
const NEGATIVO = ["lixo", "mentira", "mentiroso", "golpe", "fake", "ruim", "horrivel", "pessimo", "errado", "burro", "idiota", "enganacao", "picareta", "chato"];
const SPAM = ["http", "www", ".com", "whatsapp", "zap", "telegram", "wa me", "t me", "inscreva se no meu", "meu canal", "pix", "ganhe dinheiro", "renda extra garantida", "chama no", "me chama", "dm"];

const soEmoji = (s) => s.trim().length > 0 && !/[\p{L}\p{N}]/u.test(s);

/** Classifica um comentário. Retorna { categoria, motivo, revisaoObrigatoria, autoElegivel }. */
export function classificar(texto, { maxCaracteres = 80 } = {}) {
  const t = norm(texto);
  const bruto = String(texto);
  const ehPergunta = bruto.includes("?") || tem(t, PERGUNTA);
  const temFinanca = tem(t, FINANCAS) || /r\$\s*\d|\d\s*(mil|k|reais|%|conto)/i.test(bruto);

  let r;
  if (tem(t, SPAM) || /https?:\/\/|@\w{3,}|\+?\d[\d\s-]{8,}/.test(bruto)) r = { categoria: "spam", motivo: "link, contato ou autopromoção" };
  else if (temFinanca && (ehPergunta || /(me ajud|preciso|tenho \d|devo|quero investir)/.test(t)))
    r = { categoria: "financeira", motivo: "pergunta sobre dinheiro: precisa da sua revisão" };
  else if (tem(t, NEGATIVO)) r = { categoria: "negativo", motivo: "crítica ou palavra negativa" };
  else if (ehPergunta) r = { categoria: "pergunta", motivo: "pergunta" };
  else if ((soEmoji(bruto) || tem(t, ELOGIO)) && bruto.length <= maxCaracteres && !temFinanca)
    r = { categoria: "simples", motivo: "elogio ou agradecimento curto" };
  else r = { categoria: "outro", motivo: "comentário comum" };

  return {
    ...r,
    revisaoObrigatoria: r.categoria === "financeira",
    autoElegivel: r.categoria === "simples",
  };
}

const MODELOS = {
  simples: [
    "Valeu demais pelo comentário! 🙌",
    "Que bom que gostou! Obrigado por assistir. 💚",
    "Obrigado! Tem muito mais vindo por aí. 🚀",
    "Fico feliz que ajudou! Valeu pelo apoio. 🙏",
    "Muito obrigado! Compartilha com quem precisa ver isso. 💡",
  ],
  financeira: [
    "Ótima pergunta! Cada caso depende do seu objetivo, prazo e reserva de emergência, então não dá para indicar algo específico por aqui. Vou anotar o tema para um próximo vídeo. 📌",
    "Boa pergunta! Não faço recomendação individual, mas a regra geral é: reserva de emergência primeiro, depois comparar rentabilidade, risco e liquidez. Vale anotar para um vídeo. 📊",
  ],
  pergunta: ["Boa pergunta! Vou trazer isso em um próximo vídeo. Fica de olho! 👀", "Valeu pela pergunta! Anotei aqui para um próximo conteúdo. ✍️"],
  negativo: ["Obrigado pela opinião! Se puder contar o que achou que ficou errado, eu reviso com carinho. 🙏"],
  outro: ["Valeu pelo comentário! 💚", "Obrigado por participar! 🙌"],
  spam: [],
};

/** Sugestão de resposta; varia o modelo pelo id para não repetir a mesma frase. */
export function sugerirResposta(categoria, id = "", { nome, assinatura = "" } = {}) {
  const lista = MODELOS[categoria] ?? MODELOS.outro;
  if (!lista.length) return "";
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const base = lista[h % lista.length];
  const nomeLimpo = nome?.replace(/^@/, "").split(/\s+/)[0];
  const saud = nomeLimpo && /^[\p{L}]{2,20}$/u.test(nomeLimpo) && categoria !== "simples" ? `${nomeLimpo}, ` : "";
  const texto = saud ? `${saud}${base.charAt(0).toLowerCase()}${base.slice(1)}` : base;
  return assinatura ? `${texto} ${assinatura}` : texto;
}

/** Bloqueia textos que não devem sair: vazio, longo demais, ou com marcador por preencher. */
export function problemaResposta(texto) {
  if (!texto || !texto.trim()) return "resposta vazia";
  if (texto.length > 10000) return "resposta acima de 10.000 caracteres";
  if (/\[[^\]]*\]|\bTODO\b|XXX/.test(texto)) return "resposta ainda tem um trecho por preencher entre colchetes";
  return null;
}
