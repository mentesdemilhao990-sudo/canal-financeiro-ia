// Título, descrição, hashtags e tags automáticos a partir do episódio.
// Tudo por regras (sem IA paga), respeitando os limites do YouTube:
// título até 100 caracteres, descrição até 5.000 bytes, tags somando até 500
// caracteres e sem os sinais < e >.

export const LIMITES = { titulo: 100, descricaoBytes: 5000, tagsTotal: 500, hashtagsVisiveis: 3 };

// Termos do nicho que viram tags quando aparecem no título ou na narração.
const GLOSSARIO = [
  "inflação", "juros compostos", "juros", "reserva de emergência", "tesouro direto", "tesouro selic", "selic",
  "cdb", "cdi", "lci", "lca", "poupança", "renda fixa", "renda variável", "ações", "dividendos", "fii",
  "fundos imobiliários", "bolsa de valores", "cartão de crédito", "dívida", "dívidas", "empréstimo", "orçamento",
  "aposentadoria", "previdência", "imposto de renda", "investimentos", "investir", "patrimônio", "salário",
  "independência financeira", "liberdade financeira", "economizar", "poder de compra", "criptomoedas", "bitcoin",
];

export const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const limpa = (s) => s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
const chave = (s) => semAcento(s).toLowerCase().trim();

/** "Juros compostos!" -> "juroscompostos" (hashtag sem acento, minúscula, sem espaços). */
export function paraHashtag(s) {
  return semAcento(String(s)).toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_]/g, "");
}

function unicos(lista, normaliza = chave) {
  const vistos = new Set();
  return lista.filter((x) => {
    const k = normaliza(x);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

function cortarTitulo(t) {
  if (t.length <= LIMITES.titulo) return t;
  const corte = t.slice(0, LIMITES.titulo - 1);
  return `${corte.slice(0, corte.lastIndexOf(" ") > 60 ? corte.lastIndexOf(" ") : corte.length).trim()}…`;
}

/** Tamanho que o YouTube conta: tags com espaço ganham aspas, e há vírgulas entre elas. */
export function tamanhoTags(tags) {
  return tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

function cortarBytes(texto, max) {
  const enc = new TextEncoder();
  if (enc.encode(texto).length <= max) return texto;
  let s = texto;
  while (enc.encode(s + "…").length > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Termos do glossário encontrados no texto, na ordem do glossário. */
export function termosDoNicho(texto) {
  const t = ` ${chave(texto).replace(/[^a-z0-9]+/g, " ")} `;
  return GLOSSARIO.filter((g) => t.includes(` ${chave(g)} `));
}

/**
 * Gera os metadados do YouTube.
 * @param episode episódio já validado por parseEpisode
 * @param cfg     config/publicacao.json -> youtube
 * @param info    opcional: out/<id>/<id>-info.json (usa a duração)
 */
export function youtubeMetadata(episode, cfg = {}, info = {}) {
  const yt = episode.publicacao?.youtube ?? {};
  const textoTodo = [episode.title, episode.description, ...episode.scenes.map((s) => s.narration)].join(" ");
  const nicho = termosDoNicho(textoTodo);

  const title = cortarTitulo(limpa(yt.titulo ?? episode.title));

  const curto = episode.formato ? episode.formato === "short" : (info.duration ?? episode.targetDurationSeconds ?? 60) <= 180;
  const hashtags = unicos(
    [
      ...(yt.hashtags ?? []),
      ...(cfg.hashtagsFixas ?? []),
      ...episode.tags,
      ...nicho,
    ].map(paraHashtag),
    (x) => x,
  ).slice(0, cfg.maxHashtags ?? 5);
  if (cfg.marcarComoShorts !== false && curto) hashtags.push("shorts");

  let tags = unicos(
    [...episode.tags, ...(yt.tagsExtras ?? []), ...nicho, ...(cfg.tagsFixas ?? [])].map(limpa).filter((t) => t.length <= 60),
  );
  while (tags.length && tamanhoTags(tags) > LIMITES.tagsTotal) tags = tags.slice(0, -1);

  const caps = !curto && Array.isArray(info.capitulos) ? info.capitulos : [];
  const partes = [
    limpa(episode.description || episode.title),
    caps.length ? ["Capítulos:", ...caps.map((c) => `${c.tempo} ${limpa(c.titulo)}`)].join("\n") : "",
    episode.disclaimer ? `⚠️ ${limpa(episode.disclaimer)}` : "",
    cfg.rodapeDescricao ? limpa(cfg.rodapeDescricao) : "",
    hashtags.map((h) => `#${h}`).join(" "),
  ].filter(Boolean);
  const description = cortarBytes(partes.join("\n\n"), LIMITES.descricaoBytes);

  return {
    title,
    description,
    tags,
    hashtags,
    categoryId: String(cfg.categoryId ?? "27"),
    defaultLanguage: cfg.defaultLanguage ?? "pt-BR",
    madeForKids: Boolean(cfg.madeForKids),
    containsSyntheticMedia: Boolean(cfg.containsSyntheticMedia),
  };
}

/** Confere os limites e devolve a lista de problemas (vazia se estiver tudo certo). */
export function problemasMetadata(m) {
  const p = [];
  if (!m.title || m.title.length > LIMITES.titulo) p.push(`título vazio ou com mais de ${LIMITES.titulo} caracteres`);
  if (/[<>]/.test(m.title + m.description + m.tags.join(""))) p.push("contém < ou >, que o YouTube recusa");
  if (new TextEncoder().encode(m.description).length > LIMITES.descricaoBytes) p.push("descrição acima de 5.000 bytes");
  if (tamanhoTags(m.tags) > LIMITES.tagsTotal) p.push("tags somam mais de 500 caracteres");
  if (m.hashtags.length > 15) p.push("mais de 15 hashtags: o YouTube ignoraria todas");
  return p;
}
