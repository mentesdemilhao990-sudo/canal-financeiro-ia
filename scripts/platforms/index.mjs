// Plataformas de publicação. Cada uma segue o mesmo contrato (veja docs/plataformas-futuras.md):
//   metadados(episodio, cfg, info) -> { ... }   textos prontos para a plataforma
//   publicar(arquivo, metadados)   -> { id, url } sempre começando privado/rascunho
//   comentarios(id)                -> lista no formato de data/comentarios.json
//   responder(idComentario, texto)
// Hoje só o YouTube está implementado (scripts/publicar.mjs e scripts/comentarios.mjs).
import { youtube } from "./youtube.mjs";
import { instagram } from "./instagram.mjs";
import { tiktok } from "./tiktok.mjs";

export const PLATAFORMAS = { youtube, instagram, tiktok };
