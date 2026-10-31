// TikTok — estrutura preparada, ainda NÃO implementado.
// Caminho gratuito previsto: TikTok Content Posting API (Direct Post) com app no
// TikTok for Developers. Enquanto o app não passa pela auditoria do TikTok, os
// posts feitos pela API ficam só visíveis para você (SELF_ONLY) — o que combina
// com a regra "primeiro envio sempre privado".
// A API pública do TikTok não permite responder comentários.
// Secrets previstos: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN.
import { paraHashtag } from "../lib/metadata.mjs";

class NaoImplementado extends Error {}

export const tiktok = {
  id: "tiktok",
  nome: "TikTok",
  situacao: "🧩 estrutura pronta, envio ainda não implementado",
  implementado: false,
  secrets: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REFRESH_TOKEN"],
  variavelLiga: "TIKTOK_PUBLICACAO",
  /** Legenda até 2.200 caracteres. */
  metadados(episode, cfg = {}) {
    const tk = episode.publicacao?.tiktok ?? {};
    const tags = [...new Set([...episode.tags, ...(cfg.hashtagsFixas ?? [])].map(paraHashtag).filter(Boolean))].slice(0, 8);
    return { legenda: (tk.legenda ?? `${episode.title} ${tags.map((t) => `#${t}`).join(" ")}`).slice(0, 2200), privacidade: "SELF_ONLY" };
  },
  async publicar() {
    throw new NaoImplementado("TikTok ainda não implementado. Veja docs/plataformas-futuras.md.");
  },
  async comentarios() {
    throw new NaoImplementado("TikTok ainda não implementado.");
  },
  async responder() {
    throw new NaoImplementado("A API do TikTok não permite responder comentários.");
  },
};
