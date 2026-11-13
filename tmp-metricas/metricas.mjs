// TEMPORÁRIO, só leitura: lê métricas do canal (Data API + tentativa de Analytics API).
import { credenciaisDoAmbiente } from "../scripts/lib/youtube-api.mjs";
const c = credenciaisDoAmbiente();
const tr = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: "refresh_token" }) });
const tj = await tr.json();
if (!tj.access_token) { console.log("LOGIN FALHOU", tr.status, tj.error, tj.error_description); process.exit(1); }
console.log("ESCOPOS:", tj.scope);
const H = { authorization: `Bearer ${tj.access_token}` };
const g = async (u) => { const r = await fetch(u, { headers: H }); const j = await r.json(); if (!r.ok) return { erro: r.status, msg: j.error?.message }; return j; };
const API = "https://www.googleapis.com/youtube/v3";
const ch = await g(`${API}/channels?part=snippet,statistics,contentDetails&mine=true`);
const canal = ch.items[0];
console.log("CANAL", JSON.stringify({ id: canal.id, nome: canal.snippet.title, criado: canal.snippet.publishedAt, ...canal.statistics }));
let ids = [], tok = "";
do { const p = await g(`${API}/playlistItems?part=contentDetails&maxResults=50&playlistId=${canal.contentDetails.relatedPlaylists.uploads}${tok ? "&pageToken=" + tok : ""}`); ids.push(...p.items.map(i => i.contentDetails.videoId)); tok = p.nextPageToken; } while (tok);
const v = await g(`${API}/videos?part=snippet,statistics,contentDetails,status&id=${ids.join(",")}`);
for (const x of v.items) console.log("VIDEO", JSON.stringify({ id: x.id, t: x.snippet.title, pub: x.snippet.publishedAt, dur: x.contentDetails.duration, priv: x.status.privacyStatus, made4kids: x.status.madeForKids, ...x.statistics, tags: (x.snippet.tags||[]).length, desc: x.snippet.description.slice(0,120) }));
// Analytics API
const A = "https://youtubeanalytics.googleapis.com/v2/reports";
const base = `ids=channel==MINE&startDate=2026-10-25&endDate=2026-11-13`;
const reps = {
  canal_dia: `${base}&metrics=views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost&dimensions=day&sort=day`,
  por_video: `${base}&metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes&dimensions=video&sort=-views&maxResults=50`,
  trafego: `${base}&metrics=views,estimatedMinutesWatched&dimensions=insightTrafficSourceType&sort=-views`,
  trafego_video: `${base}&metrics=views&dimensions=video,insightTrafficSourceType&sort=-views&maxResults=200`,
  impressoes: `${base}&metrics=views,videoThumbnailImpressions,videoThumbnailImpressionsClickRate&dimensions=video&sort=-views&maxResults=50`,
  tipo: `${base}&metrics=views,estimatedMinutesWatched,averageViewDuration&dimensions=creatorContentType&sort=-views`,
  pais: `${base}&metrics=views&dimensions=country&sort=-views&maxResults=10`,
  idade: `${base}&metrics=viewerPercentage&dimensions=ageGroup,gender`,
  dispositivo: `${base}&metrics=views&dimensions=deviceType&sort=-views`,
  inscritos_status: `${base}&metrics=views,averageViewDuration&dimensions=subscribedStatus`,
};
for (const [k, q] of Object.entries(reps)) { const r = await g(`${A}?${q}`); console.log("ANALYTICS", k, JSON.stringify(r.erro ? r : { cols: r.columnHeaders?.map(h => h.name), rows: r.rows })); }
for (const id of v.items.map(x => x.id)) {
  const r = await g(`${A}?${base}&metrics=audienceWatchRatio,relativeRetentionPerformance&dimensions=elapsedVideoTimeRatio&filters=video==${id}`);
  if (r.erro) { console.log("RET", id, JSON.stringify(r)); break; }
  const rows = r.rows || []; console.log("RET", id, JSON.stringify(rows.filter((_, i) => i % 10 === 0 || i === rows.length - 1)));
}
