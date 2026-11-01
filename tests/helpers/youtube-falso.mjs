// Carregado com `node --import` nos testes: troca o fetch por um YouTube/GitHub falso
// e grava cada chamada em $CHAMADAS_ARQ para o teste conferir. Nada sai para a internet.
import { appendFileSync, readFileSync } from "node:fs";

const log = (o) => appendFileSync(process.env.CHAMADAS_ARQ, `${JSON.stringify(o)}\n`);
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...headers } });
const cenario = process.env.CENARIO_ARQ ? JSON.parse(readFileSync(process.env.CENARIO_ARQ, "utf8")) : {};

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  let corpo = init.body;
  if (corpo instanceof URLSearchParams) corpo = Object.fromEntries(corpo);
  else if (typeof corpo === "string") try { corpo = JSON.parse(corpo); } catch {}
  else if (corpo) corpo = `<${corpo.length} bytes>`;
  log({ metodo: init.method ?? "GET", url: `${u.origin}${u.pathname}`, query: Object.fromEntries(u.searchParams), corpo });

  if (u.hostname === "oauth2.googleapis.com")
    return cenario.erroToken
      ? json({ error: cenario.erroToken, error_description: `Unauthorized for ${corpo.client_id} token ${corpo.refresh_token}` }, 401)
      : json({ access_token: "ya29.falso", expires_in: 3599, scope: "https://www.googleapis.com/auth/youtube.force-ssl", token_type: "Bearer", corpoRecebido: corpo });
  if (u.pathname.endsWith("/channels")) return json({ items: [{ id: "UCcanal", snippet: { title: cenario.nomeCanal ?? "Canal Teste" }, contentDetails: { relatedPlaylists: { uploads: "UUcanal" } } }] });
  if (u.pathname.endsWith("/playlistItems")) return json({ items: cenario.recentes ?? [] });
  if (u.pathname === "/upload/youtube/v3/videos") return new Response(null, { status: 200, headers: { location: "https://upload.falso/sessao1" } });
  if (u.hostname === "upload.falso") return json({ id: "VID123", status: { privacyStatus: "private" } });
  if (u.pathname.endsWith("/videos") && (init.method ?? "GET") === "GET")
    return json({ items: (u.searchParams.get("id") ?? "").split(",").map((id) => ({ id, status: { privacyStatus: "public" }, statistics: { viewCount: "10", likeCount: "2", commentCount: "3" } })) });
  if (u.pathname.endsWith("/videos") && init.method === "PUT") return json({ id: corpo.id, status: corpo.status });
  if (u.pathname.endsWith("/commentThreads")) return json({ items: cenario.threads ?? [] });
  if (u.pathname.endsWith("/comments") && init.method === "POST") return json({ id: `R-${corpo.snippet.parentId}` });
  if (u.hostname === "models.github.ai") return json({ choices: [{ message: { content: cenario.ia ?? "Depende do seu objetivo e prazo. Vou trazer isso num vídeo!" } }] });
  if (u.hostname === "api.github.com") return json(init.method === "GET" || !init.method ? [] : { number: 1 });
  return json({ error: { message: `rota falsa não prevista: ${u}` } }, 404);
};
