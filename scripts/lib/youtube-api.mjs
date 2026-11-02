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

/**
 * Limpa o valor colado no Secret: espaços, quebras de linha, aspas em volta e
 * prefixos comuns de cópia ("client_id=", "Bearer "). Um espaço ou quebra de
 * linha no fim já basta para o Google recusar o login.
 */
export function limparCredencial(v) {
  if (v == null) return "";
  let s = String(v).replace(/^\uFEFF/, "").trim();
  s = s.replace(/^(["'`])(.*)\1$/s, "$2").trim();
  s = s.replace(/^(client_id|client_secret|refresh_token)\s*[:=]\s*/i, "").trim();
  return s.replace(/\s+/g, "");
}

/** Lê as credenciais das variáveis de ambiente (vindas dos GitHub Actions Secrets). */
export function credenciaisDoAmbiente(env = process.env) {
  const c = {
    clientId: limparCredencial(env.YOUTUBE_CLIENT_ID),
    clientSecret: limparCredencial(env.YOUTUBE_CLIENT_SECRET),
    refreshToken: limparCredencial(env.YOUTUBE_REFRESH_TOKEN),
  };
  return c.clientId && c.clientSecret && c.refreshToken ? c : null;
}

/** Explicação em português para os erros do endpoint de token do Google. */
export const DICAS_OAUTH = {
  unauthorized_client:
    "O refresh token não pertence a este Client ID (foi gerado com outro cliente OAuth, por exemplo com as credenciais padrão do Playground ou com um cliente que foi recriado), ou o Client ID e o Client Secret são de clientes diferentes. Gere o refresh token de novo no Playground com 'Use your own OAuth credentials' marcado ANTES de autorizar, usando exatamente o mesmo Client ID e Secret, e atualize os Secrets YOUTUBE_CLIENT_ID e YOUTUBE_REFRESH_TOKEN (e YOUTUBE_CLIENT_SECRET se tiver dúvida) com os valores dessa mesma sessão.",
  invalid_client: "Client ID ou Client Secret errado, ou o cliente OAuth foi apagado. Confira YOUTUBE_CLIENT_ID e YOUTUBE_CLIENT_SECRET no Google Cloud (Clientes).",
  invalid_grant:
    "O refresh token expirou ou foi revogado. Se o app está em modo 'Teste', ele expira em 7 dias: publique o app (passo 4 do tutorial) e gere um token novo. Atualize YOUTUBE_REFRESH_TOKEN.",
  invalid_request: "Falta algum parâmetro. Algum dos três Secrets chegou vazio.",
  invalid_scope: "O escopo pedido não foi autorizado. Gere o token com https://www.googleapis.com/auth/youtube.force-ssl.",
};

/** Tira de um texto qualquer coisa parecida com segredo antes de mostrar no log. */
export function sanitizar(texto, cred = {}) {
  let s = String(texto ?? "");
  for (const v of Object.values(cred)) if (v && v.length > 4) s = s.split(v).join("[oculto]");
  return s
    .replace(/GOCSPX-[\w-]+/g, "[oculto]")
    .replace(/1\/\/[\w-]+/g, "[oculto]")
    .replace(/ya29\.[\w.-]+/g, "[oculto]")
    .replace(/\d+-[a-z0-9]+\.apps\.googleusercontent\.com/gi, "[client_id]");
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
      const desc = j.error_description ? `: ${sanitizar(j.error_description, this.cred)}` : "";
      const dica = DICAS_OAUTH[j.error] ? ` ${DICAS_OAUTH[j.error]}` : "";
      const e = new ErroYouTube(`Falha no login OAuth (HTTP ${r.status}, ${j.error ?? "sem código"}${desc}).${dica}`, r.status, j.error);
      e.descricao = j.error_description ? sanitizar(j.error_description, this.cred) : undefined;
      throw e;
    }
    this.token = j.access_token;
    this.escopos = j.scope;
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
   * Envia o vídeo (upload retomável, em uma parte). Por padrão PRIVADO; só a
   * pauta diária pede "public" ou um horário (publicarEm), autorizada pelo Patrick.
   */
  async enviarVideo(arquivo, meta, { privacidade = "private", notificar = false, publicarEm = null } = {}) {
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
        // Agendado: sobe privado e o próprio YouTube torna público na hora marcada.
        privacyStatus: publicarEm ? "private" : privacidade,
        ...(publicarEm ? { publishAt: new Date(publicarEm).toISOString() } : {}),
        selfDeclaredMadeForKids: meta.madeForKids,
        containsSyntheticMedia: meta.containsSyntheticMedia,
        embeddable: true,
        license: "youtube",
      },
    };
    this.cota.reservar("videos.insert");
    const ini = await this.fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status&notifySubscribers=${notificar ? "true" : "false"}`, {
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
