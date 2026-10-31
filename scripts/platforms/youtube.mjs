import { youtubeMetadata } from "../lib/metadata.mjs";

export const youtube = {
  id: "youtube",
  nome: "YouTube",
  situacao: "✅ implementado (Data API v3 + OAuth 2.0)",
  implementado: true,
  metadados: youtubeMetadata,
  // Envio, visibilidade e comentários: scripts/lib/youtube-api.mjs
};
