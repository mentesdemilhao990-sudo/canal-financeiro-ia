// Instagram (Reels) — estrutura preparada, ainda NÃO implementado.
// Caminho gratuito previsto: Instagram Graph API (Content Publishing) com conta
// Profissional (Business/Creator) ligada a uma Página do Facebook e um app da Meta.
// Secrets previstos: INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN (token de longa duração).
// O vídeo precisa estar numa URL pública (ex.: Release do GitHub) para a API buscar.
// Limite: 50 publicações via API a cada 24 h por conta (rever na documentação ao implementar).
import { paraHashtag } from "../lib/metadata.mjs";

class NaoImplementado extends Error {}

export const instagram = {
  id: "instagram",
  nome: "Instagram",
  situacao: "🧩 estrutura pronta, envio ainda não implementado",
  implementado: false,
  secrets: ["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN"],
  variavelLiga: "INSTAGRAM_PUBLICACAO",
  /** Legenda até 2.200 caracteres e no máximo 30 hashtags (regra do Instagram). */
  metadados(episode, cfg = {}) {
    const ig = episode.publicacao?.instagram ?? {};
    const tags = [...new Set([...(cfg.hashtagsFixas ?? []), ...episode.tags].map(paraHashtag).filter(Boolean))].slice(0, 30);
    const legenda = ig.legenda ?? [episode.title, "", episode.description, episode.disclaimer ? `\n⚠️ ${episode.disclaimer}` : "", "", tags.map((t) => `#${t}`).join(" ")].join("\n");
    return { legenda: legenda.slice(0, 2200), hashtags: tags };
  },
  async publicar() {
    throw new NaoImplementado("Instagram ainda não implementado. Veja docs/plataformas-futuras.md.");
  },
  async comentarios() {
    throw new NaoImplementado("Instagram ainda não implementado.");
  },
  async responder() {
    throw new NaoImplementado("Instagram ainda não implementado.");
  },
};
