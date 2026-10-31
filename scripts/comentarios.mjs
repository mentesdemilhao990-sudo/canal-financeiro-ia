#!/usr/bin/env node
// Comentários do YouTube: ler, classificar, sugerir, aprovar e responder.
//
//   node scripts/comentarios.mjs ler              -> busca comentários novos dos vídeos enviados
//   node scripts/comentarios.mjs aplicar-issue    -> lê as caixas marcadas na issue de aprovação
//   node scripts/comentarios.mjs aprovar <ids> [--texto "..."]  -> aprova pelo id
//   node scripts/comentarios.mjs ignorar <ids>
//   node scripts/comentarios.mjs enviar           -> envia as aprovadas (se YOUTUBE_RESPOSTAS=ligadas)
//   node scripts/comentarios.mjs issue            -> atualiza a issue com o que falta aprovar
//
// Nenhuma resposta sai sem: credenciais + YOUTUBE_RESPOSTAS=ligadas + (sua aprovação OU,
// só para comentários simples, YOUTUBE_RESPOSTA_AUTOMATICA=ligada e habilitada na config).
// Perguntas sobre dinheiro NUNCA recebem resposta automática.
import { appendFileSync, readFileSync } from "node:fs";
import { classificar, problemaResposta, sugerirResposta } from "./lib/comentarios.mjs";
import { Cota, gravarJson, lerJson, lerPublicacoes, STATUS_REAIS } from "./lib/estado.mjs";
import { YouTube, credenciaisDoAmbiente } from "./lib/youtube-api.mjs";
import { IA } from "./lib/ia.mjs";
import { modos, motivoSimulacao } from "./lib/modos.mjs";
import { GitHub } from "./lib/github.mjs";
import { corpoIssue, escolherAutomaticas, lerIssue } from "./lib/aprovacao.mjs";

const cfg = JSON.parse(readFileSync(process.env.PUBLICACAO_CONFIG ?? "config/publicacao.json", "utf8"));
const cc = cfg.comentarios ?? {};
const ARQ = "comentarios.json";
const [cmd, ...resto] = process.argv.slice(2);
const opt = (nome) => {
  const i = resto.indexOf(nome);
  return i >= 0 ? resto[i + 1] : undefined;
};
const resumo = (l) => {
  console.log(l);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${l}\n`);
};

const lerComentarios = () => lerJson(ARQ, { _leia: "Gerado automaticamente. Comentários lidos do YouTube e o que fazer com cada um.", ultimaLeitura: null, itens: [] });
const gravar = (d) => {
  d.itens = d.itens.slice(-3000);
  gravarJson(ARQ, d);
};

const m = modos(process.env, cfg);
const cota = new Cota(cfg.cota);
const yt = () => new YouTube({ credenciais: credenciaisDoAmbiente(), cota });

// ------------------------------------------------------------------- ler
async function ler() {
  const dados = lerComentarios();
  resumo(`## 💬 Comentários · ${new Date().toISOString().slice(0, 16)}Z`);
  if (!m.leitura) {
    resumo(`> Não li nada: ${motivoSimulacao(m, "publicacao").split(" (")[0]}.`);
    return dados;
  }
  const api = yt();
  const pubs = lerPublicacoes();
  const videos = pubs.itens.filter((i) => i.plataforma === "youtube" && i.videoId && STATUS_REAIS.includes(i.status));
  if (!videos.length) {
    resumo("Nenhum vídeo enviado ainda.");
    return dados;
  }
  const canal = await api.meuCanal();

  // Visibilidade e números de cada vídeo, lidos do YouTube (1 unidade a cada 50 vídeos).
  // Ficam em data/estatisticas.json para não disputar o registro de envios com o workflow de publicação.
  const est = lerJson("estatisticas.json", { _leia: "Gerado automaticamente. Situação dos vídeos lida do YouTube.", videos: {} });
  for (const v of await api.statusVideos(videos.map((x) => x.videoId))) {
    const priv = v.status?.privacyStatus;
    est.videos[v.id] = {
      status: priv === "public" ? "publico" : priv === "unlisted" ? "nao_listado" : v.status?.publishAt ? "agendado" : "privado",
      privacidade: priv,
      views: +v.statistics?.viewCount || 0,
      likes: +v.statistics?.likeCount || 0,
      comentarios: +v.statistics?.commentCount || 0,
      em: new Date().toISOString(),
    };
  }
  gravarJson("estatisticas.json", est);

  const ia = new IA({ modelo: cc.ia?.modelo, maxPorExecucao: cc.ia?.maxPorExecucao ?? 30, desligada: cc.ia?.habilitada === false || process.env.IA_RESPOSTAS === "desligada" });
  let novos = 0;
  for (const v of videos.filter((x) => !["privado", "agendado"].includes(est.videos[x.videoId]?.status ?? x.status))) {
    let threads;
    try {
      threads = await api.comentarios(v.videoId, cc.maxComentariosPorVideo ?? 200);
    } catch (e) {
      if (e.motivo === "commentsDisabled") continue;
      throw e;
    }
    for (const t of threads) {
      const c = t.snippet.topLevelComment.snippet;
      const respostaDoCanal = (t.replies?.comments ?? []).find((r) => r.snippet.authorChannelId?.value === canal.id);
      const existente = dados.itens.find((x) => x.id === t.id);
      if (existente) {
        if (respostaDoCanal && !["respondido", "auto"].includes(existente.status))
          Object.assign(existente, { status: "respondido", respondidoEm: respostaDoCanal.snippet.publishedAt, respostaId: respostaDoCanal.id, resposta: respostaDoCanal.snippet.textOriginal, origem: "manual" });
        continue;
      }
      if (c.authorChannelId?.value === canal.id) continue; // comentário do próprio canal
      const cls = classificar(c.textOriginal ?? c.textDisplay, { maxCaracteres: cc.respostaAutomatica?.maxCaracteresComentario ?? 80 });
      // Elogios simples usam os textos prontos (são os únicos que podem sair sozinhos);
      // o resto ganha sugestão da IA gratuita, sempre para a sua aprovação.
      const sugIA = cls.categoria === "simples" ? null : await ia.sugerir({ texto: c.textOriginal ?? c.textDisplay, categoria: cls.categoria, tituloVideo: v.titulo });
      dados.itens.push({
        id: t.id,
        videoId: v.videoId,
        episodio: v.episodio,
        autor: c.authorDisplayName,
        autorCanal: c.authorChannelId?.value,
        texto: c.textOriginal ?? c.textDisplay,
        publicadoEm: c.publishedAt,
        curtidas: c.likeCount ?? 0,
        ...cls,
        sugestao: sugIA ? `${sugIA}${cc.assinatura ? ` ${cc.assinatura}` : ""}` : sugerirResposta(cls.categoria, t.id, { nome: c.authorDisplayName, assinatura: cc.assinatura }),
        sugestaoOrigem: sugIA ? "ia" : "modelo",
        status: respostaDoCanal ? "respondido" : cls.categoria === "spam" ? "ignorar_sugerido" : "pendente",
        podeResponder: t.snippet.canReply !== false,
        lidoEm: new Date().toISOString(),
      });
      novos++;
    }
  }
  dados.ultimaLeitura = new Date().toISOString();
  resumo(`Lidos ${videos.length} vídeo(s), ${novos} comentário(s) novo(s). Sugestões com IA: ${ia.ativa ? "ligadas" : `usando textos prontos (${ia.motivoParada})`}.`);
  gravar(dados);
  return dados;
}

// ------------------------------------------------------------------ enviar
async function enviar(dados) {
  const aprovadas = dados.itens.filter((c) => c.status === "aprovado");
  const auto = escolherAutomaticas(dados, cc.respostaAutomatica);
  if (!aprovadas.length && !auto.length) return;
  if (!m.respostas) {
    resumo(`> 🧪 ${aprovadas.length} resposta(s) aprovada(s) aguardando: ${motivoSimulacao(m, "respostas")}. Nada foi enviado.`);
    return;
  }
  const api = yt();
  const fila = [...aprovadas.map((c) => ({ c, origem: "aprovada", texto: c.resposta ?? c.sugestao }))];
  if (m.automatica) fila.push(...auto.map((c) => ({ c, origem: "auto", texto: c.sugestao })));
  else if (auto.length) resumo(`> ${auto.length} comentário(s) simples poderiam ter resposta automática, mas ela está desligada (${motivoSimulacao(m, "automatica")}).`);

  for (const { c, origem, texto } of fila) {
    const prob = problemaResposta(texto);
    if (prob) {
      c.erro = prob;
      resumo(`- ⚠️ ${c.id}: ${prob}`);
      continue;
    }
    if (origem === "auto" && (c.revisaoObrigatoria || c.categoria !== "simples")) continue; // trava dupla
    try {
      const r = await api.responder(c.id, texto);
      Object.assign(c, { status: origem === "auto" ? "auto" : "respondido", origem, resposta: texto, respostaId: r.id, respondidoEm: new Date().toISOString(), erro: undefined });
      resumo(`- ✅ respondido (${origem}) ${c.autor}: “${texto.slice(0, 60)}”`);
    } catch (e) {
      c.erro = e.message;
      resumo(`- ❌ ${c.id}: ${e.message}`);
      if (e.motivo === "quotaExceeded" || e.constructor.name === "ErroCota") break;
    }
  }
  gravar(dados);
}

// ------------------------------------------------------------ aprovação
function aprovar(dados, ids, texto) {
  for (const id of ids) {
    const c = dados.itens.find((x) => x.id === id);
    if (!c) {
      console.error(`· comentário ${id} não encontrado`);
      continue;
    }
    if (["respondido", "auto"].includes(c.status)) continue;
    const final = (texto ?? c.resposta ?? c.sugestao ?? "").trim();
    const prob = problemaResposta(final);
    if (prob) {
      c.erro = prob;
      console.error(`· ${id}: ${prob}`);
      continue;
    }
    Object.assign(c, { status: "aprovado", resposta: final, aprovadoEm: new Date().toISOString(), erro: undefined });
  }
}

function ignorar(dados, ids) {
  for (const id of ids) {
    const c = dados.itens.find((x) => x.id === id);
    if (c && !["respondido", "auto"].includes(c.status)) Object.assign(c, { status: "ignorado", ignoradoEm: new Date().toISOString() });
  }
}

async function sincronizarIssue(dados) {
  const gh = new GitHub();
  if (!gh.disponivel) return;
  const { corpo, pendentes } = corpoIssue(dados, lerPublicacoes(), { envioLigado: m.respostas });
  await gh.sincronizarIssue(`💬 Comentários para aprovar (${pendentes})`, corpo, { pendentes });
}

// ------------------------------------------------------------------- main
async function main() {
  let dados = lerComentarios();
  if (cmd === "ler") {
    dados = await ler();
    await enviar(dados);
    await sincronizarIssue(dados);
  } else if (cmd === "aplicar-issue") {
    const corpo = process.env.ISSUE_BODY ?? (opt("--arquivo") ? readFileSync(opt("--arquivo"), "utf8") : "");
    const { aprovar: ap, ignorar: ig, textos } = lerIssue(corpo);
    // Guarda os textos editados (mesmo dos que ainda não foram aprovados).
    for (const [id, t] of Object.entries(textos)) {
      const c = dados.itens.find((x) => x.id === id);
      if (c && ["pendente", "ignorar_sugerido"].includes(c.status) && t && !t.startsWith("(sem sugestão")) c.resposta = t;
    }
    aprovar(dados, ap);
    ignorar(dados, ig);
    resumo(`Issue: ${ap.length} aprovada(s), ${ig.length} ignorada(s).`);
    gravar(dados);
    await enviar(dados);
    await sincronizarIssue(dados);
  } else if (cmd === "aprovar") {
    aprovar(dados, resto[0]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [], opt("--texto"));
    gravar(dados);
    await enviar(dados);
    await sincronizarIssue(dados);
  } else if (cmd === "ignorar") {
    ignorar(dados, resto[0]?.split(",").map((s) => s.trim()).filter(Boolean) ?? []);
    gravar(dados);
    await sincronizarIssue(dados);
  } else if (cmd === "enviar") {
    await enviar(dados);
    await sincronizarIssue(dados);
  } else if (cmd === "issue") {
    await sincronizarIssue(dados);
  } else {
    console.error("Comandos: ler | aplicar-issue | aprovar | ignorar | enviar | issue");
    process.exitCode = 2;
  }
}

if (process.argv[1]?.endsWith("comentarios.mjs")) {
  try {
    await main();
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exitCode = 1;
  } finally {
    cota.salvar();
  }
}
