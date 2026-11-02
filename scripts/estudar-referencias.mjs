#!/usr/bin/env node
// Estuda os vídeos mais vistos dos canais de referência pela API oficial do
// YouTube (título, duração, visualizações, descrição, tags, capítulos).
// Só para entender o estilo; não baixa vídeos. Resultado em referencias/<canal>.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { credenciaisDoAmbiente, YouTube } from "./lib/youtube-api.mjs";

const cfg = JSON.parse(readFileSync("pedidos/referencias.json", "utf8"));
const yt = new YouTube({ credenciais: credenciaisDoAmbiente(), cota: { reservar() {} } });
mkdirSync("referencias", { recursive: true });

const segundos = (iso) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso ?? "") ?? [];
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
};

for (const handle of cfg.canais) {
  try {
    const c = await yt.get("channels.list", "channels", { part: "id,snippet,statistics", forHandle: handle });
    const canal = c.items?.[0];
    if (!canal) throw new Error("canal não encontrado");
    const busca = await yt.get("search.list", "search", { part: "id", channelId: canal.id, order: "viewCount", type: "video", maxResults: "25", relevanceLanguage: "pt" });
    const ids = (busca.items ?? []).map((i) => i.id.videoId).filter(Boolean);
    const v = await yt.get("videos.list", "videos", { part: "snippet,contentDetails,statistics", id: ids.join(","), hl: "pt-BR" });
    const videos = (v.items ?? []).map((x) => ({
      id: x.id,
      titulo: x.snippet.localized?.title ?? x.snippet.title,
      publicado: x.snippet.publishedAt?.slice(0, 10),
      duracao: segundos(x.contentDetails.duration),
      views: +x.statistics.viewCount || 0,
      likes: +x.statistics.likeCount || 0,
      comentarios: +x.statistics.commentCount || 0,
      tags: x.snippet.tags ?? [],
      descricao: (x.snippet.localized?.description ?? x.snippet.description ?? "").slice(0, 1500),
    }));
    videos.sort((a, b) => b.views - a.views);
    const nome = handle.replace(/^@/, "");
    writeFileSync(`referencias/${nome}.json`, JSON.stringify({ canal: canal.snippet.title, inscritos: +canal.statistics.subscriberCount || null, videos }, null, 2));
    console.log(`${handle}: ${videos.length} vídeos (${videos.filter((x) => x.duracao <= 180).length} curtos)`);
  } catch (e) {
    console.log(`${handle}: falhou (${e.message})`);
  }
}
