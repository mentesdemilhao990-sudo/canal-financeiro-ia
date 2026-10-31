// Assuntos em alta, só com fontes gratuitas e sem chave:
//  - Google Trends (buscas em alta no Brasil, RSS público)
//  - Google Notícias (busca por termos de finanças, RSS público)
// Depois cada tema de config/temas.json ganha pontos pelo que aparece nessas fontes.
import { semAcento } from "./metadata.mjs";

const TRENDS = "https://trends.google.com/trending/rss?geo=BR";
const noticiasUrl = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

const decodificar = (s) =>
  String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();

const tag = (xml, nome) => [...xml.matchAll(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, "g"))].map((m) => decodificar(m[1]));

/** Itens de um RSS: título, data e (no Trends) tráfego e manchetes ligadas. */
export function lerRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => ({
    titulo: tag(it, "title")[0] ?? "",
    data: tag(it, "pubDate")[0] ?? "",
    fonte: tag(it, "source")[0] ?? "",
    trafego: Number(String(tag(it, "ht:approx_traffic")[0] ?? "").replace(/\D/g, "")) || 0,
    manchetes: tag(it, "ht:news_item_title"),
  }));
}

async function baixar(url, f, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await f(url, { signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (pauta-diaria canal Mente de Milhao)", accept: "application/rss+xml, application/xml, text/xml" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

/** Baixa as fontes. Falhas não param nada: só ficam anotadas em `erros`. */
export async function coletar(buscas, { fetch: f = globalThis.fetch } = {}) {
  const erros = [];
  let trends = [];
  try {
    trends = lerRss(await baixar(TRENDS, f));
  } catch (e) {
    erros.push(`Google Trends: ${e.message}`);
  }
  const noticias = [];
  const vistas = new Set();
  for (const q of buscas) {
    try {
      for (const n of lerRss(await baixar(noticiasUrl(q), f))) {
        const k = normalizar(n.titulo);
        if (!k || vistas.has(k)) continue;
        vistas.add(k);
        noticias.push({ ...n, busca: q });
      }
    } catch (e) {
      erros.push(`Google Notícias "${q}": ${e.message}`);
    }
  }
  return { trends, noticias, erros };
}

export const normalizar = (s) => ` ${semAcento(String(s)).toLowerCase().replace(/[^a-z0-9º]+/g, " ").trim()} `;

/** O texto menciona alguma das palavras do tema (palavra inteira, sem acento)? */
export function menciona(texto, palavras) {
  const t = normalizar(texto);
  return palavras.some((p) => t.includes(normalizar(p)));
}

/**
 * Dá pontos a cada tema:
 *  - busca em alta no Google que fala do tema: 5 pontos + até 5 pelo volume de buscas
 *  - cada manchete das últimas 48 h que fala do tema: 1 ponto (até 15)
 *  - época do ano (campo "meses"): 4 pontos
 * Temas usados nos últimos `diasSemRepetir` dias ficam de fora.
 */
export function pontuar(temas, { trends = [], noticias = [] }, { hoje = new Date(), usados = [], diasSemRepetir = 30 } = {}) {
  const mes = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", month: "numeric" }).format(hoje));
  const ultimoUso = new Map();
  for (const u of usados) {
    const d = new Date(u.data);
    if (!ultimoUso.has(u.tema) || ultimoUso.get(u.tema) < d) ultimoUso.set(u.tema, d);
  }
  return temas
    .map((t) => {
      const emAlta = trends.filter((x) => menciona([x.titulo, ...x.manchetes].join(" "), t.palavras));
      const manchetes = noticias.filter((n) => menciona(n.titulo, t.palavras));
      const pTrends = emAlta.reduce((n, x) => n + 5 + Math.min(5, Math.log10(Math.max(1, x.trafego)) - 2), 0);
      const pNoticias = Math.min(15, manchetes.length);
      const pEpoca = t.meses?.includes(mes) ? 4 : 0;
      const ultimo = ultimoUso.get(t.id);
      const dias = ultimo ? (hoje - ultimo) / 86400000 : Infinity;
      return {
        tema: t,
        pontos: Math.round((pTrends + pNoticias + pEpoca) * 10) / 10,
        detalhe: { buscasEmAlta: emAlta.map((x) => x.titulo), manchetes: manchetes.length, epoca: pEpoca > 0 },
        manchetes: [...emAlta.flatMap((x) => x.manchetes), ...manchetes.map((n) => n.titulo)].slice(0, 8),
        diasDesdeUltimoUso: dias,
        bloqueado: dias < diasSemRepetir,
      };
    })
    .sort((a, b) => b.pontos - a.pontos || b.diasDesdeUltimoUso - a.diasDesdeUltimoUso || a.tema.id.localeCompare(b.tema.id));
}

/** Melhor tema liberado. Se todos estiverem bloqueados, o que está há mais tempo sem uso. */
export function escolher(ranking) {
  return ranking.find((r) => !r.bloqueado) ?? [...ranking].sort((a, b) => b.diasDesdeUltimoUso - a.diasDesdeUltimoUso)[0];
}
