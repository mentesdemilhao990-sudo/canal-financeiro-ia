// Aprovação de respostas: escolha das automáticas e a issue do GitHub onde você aprova.
import { MARCADOR_ISSUE } from "./github.mjs";

// ------------------------------------------------------- resposta automática
export function escolherAutomaticas(dados, ra = {}, agora = new Date()) {
  const hoje = agora.toISOString().slice(0, 10);
  const porAutor = {};
  for (const c of dados.itens) if (c.origem === "auto" && c.respondidoEm?.startsWith(hoje)) porAutor[c.autorCanal] = (porAutor[c.autorCanal] ?? 0) + 1;
  const escolhidas = [];
  for (const c of dados.itens) {
    if (escolhidas.length >= (ra.maxPorExecucao ?? 10)) break;
    if (c.status !== "pendente" || !c.autoElegivel || c.categoria !== "simples" || c.revisaoObrigatoria || !c.podeResponder) continue;
    if (agora - new Date(c.publicadoEm) > 7 * 864e5) continue;
    if ((porAutor[c.autorCanal] ?? 0) >= (ra.maxPorAutorPorDia ?? 1)) continue;
    porAutor[c.autorCanal] = (porAutor[c.autorCanal] ?? 0) + 1;
    escolhidas.push(c);
  }
  return escolhidas;
}

// ----------------------------------------------------------------- issue
const ROTULO = { simples: "simples", financeira: "💰 financeira · revisão obrigatória", pergunta: "pergunta", negativo: "negativo", spam: "spam", outro: "outro" };
/** Tira marcadores e menções do texto de terceiros antes de colocar na issue. */
const seguro = (s) => String(s ?? "").replace(/<!--|-->/g, "").replace(/@/g, "@\u200b").replace(/[<>]/g, "");

export function corpoIssue(dados, pubs, { envioLigado = false } = {}) {
  const pend = dados.itens.filter((c) => ["pendente", "ignorar_sugerido"].includes(c.status));
  pend.sort((a, b) => (b.revisaoObrigatoria - a.revisaoObrigatoria) || a.publicadoEm.localeCompare(b.publicadoEm));
  const titulos = Object.fromEntries((pubs?.itens ?? []).map((p) => [p.videoId, p.titulo]));
  const linhas = [
    MARCADOR_ISSUE,
    "Marque **Aprovar** para enviar a resposta, ou **Ignorar** para não responder. Pode editar o texto da resposta (lápis ✏️ → mude só o texto entre as linhas `resposta`). Ao salvar, o robô processa em 1 a 2 minutos.",
    "",
    `Envio de respostas: **${envioLigado ? "ligado" : "desligado (aprovadas ficam guardadas até você ligar)"}**. Perguntas sobre dinheiro nunca são respondidas sem você.`,
    "",
  ];
  if (!pend.length) linhas.push("✅ Nada aguardando aprovação.");
  for (const [n, c] of pend.slice(0, 25).entries()) {
    linhas.push(
      "---",
      `**${n + 1}. ${seguro(c.autor)}** · ${ROTULO[c.categoria] ?? c.categoria} · [${seguro(titulos[c.videoId] ?? c.episodio)}](https://www.youtube.com/watch?v=${c.videoId}&lc=${c.id}) · ${c.publicadoEm?.slice(0, 10)}${c.sugestaoOrigem === "ia" ? " · 🤖 sugestão da IA" : ""}`,
      "",
      ...seguro(c.texto).split("\n").map((l) => `> ${l}`),
      "",
      `- [ ] ✅ Aprovar e responder <!-- aprovar:${c.id} -->`,
      `- [ ] 🚫 Ignorar <!-- ignorar:${c.id} -->`,
      "",
      `<!-- resposta:${c.id} -->`,
      c.sugestao ? seguro(c.resposta ?? c.sugestao) : "(sem sugestão: spam. Escreva aqui se quiser responder)",
      `<!-- /resposta:${c.id} -->`,
      c.erro ? `\n⚠️ ${seguro(c.erro)}` : "",
      "",
    );
  }
  if (pend.length > 25) linhas.push(`_…e mais ${pend.length - 25}. Eles aparecem aqui conforme você resolve os primeiros._`);
  return { corpo: linhas.join("\n"), pendentes: pend.length };
}

/** Lê o corpo editado da issue: caixas marcadas e textos de resposta. */
export function lerIssue(corpo) {
  const aprovar = [...corpo.matchAll(/^\s*[-*] \[[xX]\][^\n]*<!-- aprovar:([\w-]+) -->/gm)].map((x) => x[1]);
  const ignorar = [...corpo.matchAll(/^\s*[-*] \[[xX]\][^\n]*<!-- ignorar:([\w-]+) -->/gm)].map((x) => x[1]);
  const textos = {};
  for (const x of corpo.matchAll(/<!-- resposta:([\w-]+) -->\r?\n([\s\S]*?)\r?\n<!-- \/resposta:\1 -->/g)) textos[x[1]] = x[2].trim();
  return { aprovar: aprovar.filter((id) => !ignorar.includes(id)), ignorar, textos };
}

