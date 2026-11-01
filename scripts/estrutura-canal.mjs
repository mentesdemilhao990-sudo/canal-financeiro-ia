#!/usr/bin/env node
// Estrutura o canal: país, idioma e trailer; playlists por tema; vídeos já publicados
// nas playlists certas; seções da página inicial. Pode rodar de novo sem duplicar nada.
// Só age com pedidos/estrutura.json { confirmacao: "ESTRUTURAR-CANAL" }.
import { appendFileSync, readFileSync } from "node:fs";
import { YouTube, credenciaisDoAmbiente, sanitizar } from "./lib/youtube-api.mjs";
import { semAcento } from "./lib/metadata.mjs";

const API = "https://www.googleapis.com/youtube/v3";
const out = [];
const linha = (l = "") => {
  out.push(l);
  console.log(l);
};
const normaliza = (s) => semAcento(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
const json = (corpo) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

/** Decide o que falta criar, comparando com o que já existe no canal. */
export function planejar(cfg, { playlistsExistentes = [], itensPorPlaylist = {}, secoesExistentes = [], videos = {} }) {
  const porTitulo = new Map(playlistsExistentes.map((p) => [normaliza(p.titulo), p.id]));
  const criarPlaylists = cfg.playlists.filter((p) => !porTitulo.has(normaliza(p.titulo)));
  const idDe = (chave) => {
    const p = cfg.playlists.find((x) => x.chave === chave);
    return p ? porTitulo.get(normaliza(p.titulo)) ?? `novo:${chave}` : undefined;
  };
  const adicionar = [];
  for (const [ep, chaves] of Object.entries(cfg.videosNasPlaylists ?? {})) {
    const videoId = videos[ep];
    if (!videoId) continue;
    for (const ch of chaves) {
      const pl = idDe(ch);
      if (pl && !(itensPorPlaylist[pl] ?? []).includes(videoId)) adicionar.push({ playlist: pl, videoId });
    }
  }
  const temSecao = (s) =>
    secoesExistentes.some((e) => (s.tipo === "playlist" ? e.tipo === "singlePlaylist" && e.playlists?.includes(idDe(s.playlist)) : e.tipo === s.tipo));
  const criarSecoes = cfg.secoes.filter((s) => !temSecao(s)).map((s) => (s.tipo === "playlist" ? { tipo: "singlePlaylist", playlist: idDe(s.playlist) } : { tipo: s.tipo }));
  return { criarPlaylists, adicionar, criarSecoes };
}

async function todasPaginas(yt, metodo, recurso, params) {
  const itens = [];
  let pageToken;
  do {
    const j = await yt.get(metodo, recurso, { ...params, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
    itens.push(...(j.items ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return itens;
}

async function main() {
  const pedido = JSON.parse(readFileSync(process.env.PEDIDO_ESTRUTURA ?? "pedidos/estrutura.json", "utf8"));
  linha("## 🧱 Estrutura do canal");
  if (String(pedido.confirmacao ?? "").trim() !== "ESTRUTURAR-CANAL") {
    linha("Pedido sem confirmacao ESTRUTURAR-CANAL: nada foi alterado.");
    return 0;
  }
  const cred = credenciaisDoAmbiente();
  if (!cred) {
    linha("❌ Faltam os Secrets do YouTube.");
    return 1;
  }
  const pub = JSON.parse(readFileSync("config/publicacao.json", "utf8"));
  const cfg = JSON.parse(readFileSync("config/estrutura-canal.json", "utf8"));
  const yt = new YouTube({ credenciais: cred, cota: { reservar() {} } });
  let falhas = 0;

  const canal = (await yt.get("channels.list", "channels", { part: "snippet,brandingSettings", mine: "true" })).items?.[0];
  if (!canal) throw new Error("Esta conta Google não tem canal do YouTube.");
  linha(`Canal conectado: **${canal.snippet.title}**`);
  if (normaliza(canal.snippet.title) !== normaliza(pub.youtube.canalEsperado)) {
    linha(`❌ Esperado "${pub.youtube.canalEsperado}". Nada foi alterado.`);
    return 1;
  }

  // 1. País, idioma e trailer (mantém o resto do brandingSettings, inclusive descrição e banner).
  const b = structuredClone(canal.brandingSettings ?? {});
  b.channel = { ...(b.channel ?? {}), country: cfg.pais, defaultLanguage: cfg.idioma };
  if (cfg.trailer) b.channel.unsubscribedTrailer = cfg.trailer;
  try {
    await yt.chamar("channels.update", `${API}/channels?part=brandingSettings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: canal.id, brandingSettings: b }),
    });
    linha(`✅ País ${cfg.pais}, idioma ${cfg.idioma}${cfg.trailer ? " e trailer do canal" : ""} definidos.`);
  } catch (e) {
    falhas++;
    linha(`⚠️ País/idioma/trailer: ${sanitizar(e.message, cred)}`);
  }

  // 2. Playlists por tema.
  const existentes = (await todasPaginas(yt, "playlists.list", "playlists", { part: "snippet", mine: "true" })).map((p) => ({ id: p.id, titulo: p.snippet.title }));
  const itensPorPlaylist = {};
  for (const p of existentes) {
    const itens = await todasPaginas(yt, "playlistItems.list", "playlistItems", { part: "contentDetails", playlistId: p.id });
    itensPorPlaylist[p.id] = itens.map((i) => i.contentDetails.videoId);
  }
  const videos = {};
  try {
    for (const i of JSON.parse(readFileSync("data/publicacoes.json", "utf8")).itens ?? []) if (i.plataforma === "youtube" && i.videoId) videos[i.episodio] = i.videoId;
  } catch {}

  const plano1 = planejar(cfg, { playlistsExistentes: existentes, itensPorPlaylist, videos });
  for (const p of plano1.criarPlaylists) {
    try {
      const r = await yt.chamar("playlists.insert", `${API}/playlists?part=snippet,status`, json({
        snippet: { title: p.titulo, description: p.descricao, defaultLanguage: cfg.idioma },
        status: { privacyStatus: "public" },
      }));
      existentes.push({ id: r.id, titulo: p.titulo });
      itensPorPlaylist[r.id] = [];
      linha(`✅ Playlist criada: ${p.titulo}`);
    } catch (e) {
      falhas++;
      linha(`⚠️ Playlist "${p.titulo}": ${sanitizar(e.message, cred)}`);
    }
  }
  if (!plano1.criarPlaylists.length) linha("Playlists: todas já existiam.");

  // 3. Vídeos já publicados nas playlists.
  const plano2 = planejar(cfg, { playlistsExistentes: existentes, itensPorPlaylist, videos });
  for (const a of plano2.adicionar.filter((x) => !x.playlist.startsWith("novo:"))) {
    try {
      await yt.chamar("playlistItems.insert", `${API}/playlistItems?part=snippet`, json({ snippet: { playlistId: a.playlist, resourceId: { kind: "youtube#video", videoId: a.videoId } } }));
      linha(`✅ Vídeo ${a.videoId} colocado em "${existentes.find((p) => p.id === a.playlist)?.titulo}".`);
    } catch (e) {
      falhas++;
      linha(`⚠️ Vídeo ${a.videoId} na playlist: ${sanitizar(e.message, cred)}`);
    }
  }

  // 4. Seções da página inicial.
  try {
    const secoes = (await yt.get("channelSections.list", "channelSections", { part: "snippet,contentDetails", mine: "true" })).items ?? [];
    const secoesExistentes = secoes.map((s) => ({ tipo: s.snippet.type, playlists: s.contentDetails?.playlists ?? [] }));
    const plano3 = planejar(cfg, { playlistsExistentes: existentes, itensPorPlaylist, secoesExistentes, videos });
    let pos = secoes.length;
    for (const s of plano3.criarSecoes.filter((x) => !String(x.playlist ?? "").startsWith("novo:"))) {
      const corpo = { snippet: { type: s.tipo, position: pos } };
      if (s.playlist) corpo.contentDetails = { playlists: [s.playlist] };
      try {
        await yt.chamar("channelSections.insert", `${API}/channelSections?part=snippet${s.playlist ? ",contentDetails" : ""}`, json(corpo));
        pos++;
        linha(`✅ Seção da página inicial: ${s.playlist ? existentes.find((p) => p.id === s.playlist)?.titulo : s.tipo === "recentUploads" ? "Vídeos recentes" : "Mais populares"}`);
      } catch (e) {
        falhas++;
        linha(`⚠️ Seção ${s.tipo}: ${sanitizar(e.message, cred)} (pode ser montada no YouTube Studio)`);
      }
    }
    if (!plano3.criarSecoes.length) linha("Seções: todas já existiam.");
  } catch (e) {
    falhas++;
    linha(`⚠️ Seções da página inicial: ${sanitizar(e.message, cred)} (pode ser montada no YouTube Studio)`);
  }

  linha();
  linha(falhas ? `Terminado com ${falhas} aviso(s).` : "✅ Tudo aplicado.");
  return 0;
}

if (process.argv[1]?.endsWith("estrutura-canal.mjs")) {
  let codigo = 1;
  try {
    codigo = await main();
  } catch (e) {
    linha(`❌ ${sanitizar(e.message, { a: process.env.YOUTUBE_CLIENT_SECRET, b: process.env.YOUTUBE_REFRESH_TOKEN })}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.join("\n")}\n`);
  process.exitCode = codigo;
}
