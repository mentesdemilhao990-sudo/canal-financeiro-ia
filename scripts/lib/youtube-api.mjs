// Cliente mínimo do YouTube Data API v3 com OAuth 2.0 (refresh token).
// Usa só fetch do Node, sem bibliotecas extras. Cada chamada passa pela cota.
import { readFileSync, statSync } from "node:fs";

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
const TOKEN = "https://oauth2.googleapis.com/token";

export class ErroYouTube extends Error {
  constructor(msg, status, motivo) {
    super(msg);
    this.status = status;
    this.motivo = motivo;
  }
}

/** Lê as credenciais das variáveis de ambiente (vindas dos GitHub Actions Secrets). */
export function credenciaisDoAmbiente(env = process.env) {
  const c = { clientId: env.YOUTUBE_CLIENT_ID, clientSecret: env.YOUTUBE_CLIENT_SECRET, refreshToken: env.YOUTUBE_REFRESH_TOKEN };
  return c.clientId && c.clientSecret && c.refreshToken ? c : null;
}

export class YouTube {
  constructor({ credenciais, cota, fetch: f = globalThis.fetch, log = console.log }) {
    this.cred = credenciais;
    this.cota = cota;
    this.fetch = f;
    this.log = log;
    this.token = null;
  }

  async autenticar() {
    const r = await this.fetch(TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.cred.clientId,
        client_secret: this.cred.clientSecret,
        refresh_token: this.cred.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      const dica =
        j.error === "invalid_grant"
          ? " O refresh token expirou ou foi revogado. Se o app do Google Cloud está em modo 'Teste', ele expira em 7 dias: publique o app (passo 4 do tutorial) e gere um token novo."
          : "";
      throw new ErroYouTube(`Falha no login OAuth (${j.error ?? r.status}).${dica}`, r.status, j.error);
    }
    this.token = j.access_token;
  }

  async chamar(metodo, url, init = {}) {
    if (!this.token) await this.autenticar();
    this.cota.reservar(metodo);
    const r = await this.fetch(url, { ...init, headers: { authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) } });
    if (r.status === 204) return {};
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const motivo = j.error?.errors?.[0]?.reason ?? j.error?.status;
      throw new ErroYouTube(`${metodo}: ${j.error?.message ?? r.status}${motivo ? ` (${motivo})` : ""}`, r.status, motivo);
    }
    return j;
  }

  get(metodo, recurso, params) {
    return this.chamar(metodo, `${API}/${recurso}?${new URLSearchParams(params)}`);
  }

  /** Canal autenticado: id, nome e playlist de uploads. */
  async meuCanal() {
    const j = await this.get("channels.list", "channels", { part: "snippet,contentDetails", mine: "true" });
    const c = j.items?.[0];
    if (!c) throw new ErroYouTube("Esta conta Google não tem canal do YouTube.", 404, "noChannel");
    return { id: c.id, nome: c.snippet.title, uploads: c.contentDetails.relatedPlaylists.uploads };
  }

  /** Títulos dos últimos 50 envios do canal (inclui privados), para evitar duplicação. */
  async titulosRecentes(playlistUploads) {
    const j = await this.get("playlistItems.list", "playlistItems", { part: "snippet", playlistId: playlistUploads, maxResults: "50" });
    return (j.items ?? []).map((i) => ({ titulo: i.snippet.title, videoId: i.snippet.resourceId?.videoId }));
  }

  /**
   * Envia o vídeo SEMPRE como privado (upload retomável, em uma parte).
   * A troca para público é um passo separado, feito por você.
   */
  async enviarVideo(arquivo, meta) {
    if (!this.token) await this.autenticar();
    const tamanho = statSync(arquivo).size;
    const corpo = {
      snippet: {
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        categoryId: meta.categoryId,
        defaultLanguage: meta.defaultLanguage,
        defaultAudioLanguage: meta.defaultLanguage,
      },
      status: {
        privacyStatus: "private",
        selfDeclaredMadeForKids: meta.madeForKids,
        containsSyntheticMedia: meta.containsSyntheticMedia,
        embeddable: true,
        license: "youtube",
      },
    };
    this.cota.reservar("videos.insert");
    const ini = await this.fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status&notifySubscribers=false`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-length": String(tamanho),
        "x-upload-content-type": "video/mp4",
      },
      body: JSON.stringify(corpo),
    });
    const destino = ini.headers.get("location");
    if (!ini.ok || !destino) {
      const j = await ini.json().catch(() => ({}));
      throw new ErroYouTube(`videos.insert: ${j.error?.message ?? ini.status}`, ini.status, j.error?.errors?.[0]?.reason);
    }
    const r = await this.fetch(destino, {
      method: "PUT",
      headers: { "content-type": "video/mp4", "content-length": String(tamanho) },
      body: readFileSync(arquivo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new ErroYouTube(`Envio do arquivo falhou: ${j.error?.message ?? r.status}`, r.status);
    return j;
  }

  /** Muda a visibilidade: private, unlisted, public, ou private + publishAt (agendado). */
  async mudarVisibilidade(videoId, privacidade, { publicarEm, madeForKids = false } = {}) {
    const status = { privacyStatus: publicarEm ? "private" : privacidade, selfDeclaredMadeForKids: madeForKids };
    if (publicarEm) status.publishAt = new Date(publicarEm).toISOString();
    return this.chamar("videos.update", `${API}/videos?part=status`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: videoId, status }),
    });
  }

  async statusVideos(ids) {
    if (!ids.length) return [];
    const j = await this.get("videos.list", "videos", { part: "status,statistics", id: ids.slice(0, 50).join(",") });
    return j.items ?? [];
  }

  /** Comentários de primeiro nível mais recentes de um vídeo (com respostas já dadas). */
  async comentarios(videoId, max = 200) {
    const out = [];
    let pageToken;
    do {
      const j = await this.get("commentThreads.list", "commentThreads", {
        part: "snippet,replies",
        videoId,
        maxResults: "100",
        order: "time",
        textFormat: "plainText",
        ...(pageToken ? { pageToken } : {}),
      });
      out.push(...(j.items ?? []));
      pageToken = j.nextPageToken;
    } while (pageToken && out.length < max);
    return out.slice(0, max);
  }

  async responder(parentId, texto) {
    return this.chamar("comments.insert", `${API}/comments?part=snippet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snippet: { parentId, textOriginal: texto } }),
    });
  }
}
