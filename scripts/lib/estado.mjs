// Estado salvo no próprio repositório (pasta data/): vídeos publicados,
// comentários e uso de cota. Os workflows fazem commit desses arquivos.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? "data";
const arq = (nome) => path.join(DATA_DIR, nome);

export function lerJson(nome, padrao) {
  const f = arq(nome);
  if (!existsSync(f)) return structuredClone(padrao);
  return JSON.parse(readFileSync(f, "utf8"));
}

export function gravarJson(nome, dados) {
  const f = arq(nome);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(`${f}.tmp`, `${JSON.stringify(dados, null, 2)}\n`, "utf8");
  renameSync(`${f}.tmp`, f);
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Hash do conteúdo do episódio, ignorando o bloco de agenda (mudar a data não cria "vídeo novo"). */
export function hashEpisodio(episode) {
  const { publicacao, ...resto } = episode;
  return sha256(JSON.stringify(resto)).slice(0, 16);
}

/** "2026-11-05" vale como meia-noite de Brasília; sem fuso, também Brasília. */
export function quando(texto) {
  if (!texto) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return new Date(`${texto}T00:00:00-03:00`);
  if (/T\d{2}:\d{2}(:\d{2})?$/.test(texto)) return new Date(`${texto}${texto.length === 16 ? ":00" : ""}-03:00`);
  return new Date(texto);
}

// ---------------------------------------------------------------- publicações

const PUB = "publicacoes.json";
const pubPadrao = { _leia: "Gerado automaticamente. Registro de tudo que foi enviado, para nunca publicar duas vezes.", itens: [] };

export const STATUS_REAIS = ["enviando", "privado", "nao_listado", "agendado", "publico"];

export function lerPublicacoes() {
  return lerJson(PUB, pubPadrao);
}

export function gravarPublicacoes(p) {
  gravarJson(PUB, p);
}

export function buscarPublicacao(pubs, plataforma, episodio) {
  return pubs.itens.find((i) => i.plataforma === plataforma && i.episodio === episodio);
}

/**
 * Decide se um episódio pode ser enviado. Bloqueia se já houver envio real
 * (ou um envio interrompido) do mesmo episódio ou do mesmo arquivo de vídeo.
 */
export function checarDuplicado(pubs, { plataforma, episodio, hashVideo }) {
  const reais = pubs.itens.filter((i) => i.plataforma === plataforma && STATUS_REAIS.includes(i.status));
  const mesmo = reais.find((i) => i.episodio === episodio);
  if (mesmo?.status === "enviando")
    return `envio de "${episodio}" foi interrompido antes de terminar. Confira no YouTube Studio se o vídeo subiu e corrija data/${PUB} antes de tentar de novo`;
  if (mesmo) return `"${episodio}" já foi enviado (${mesmo.videoId ?? "sem id"}, ${mesmo.status})`;
  const igual = hashVideo && reais.find((i) => i.hashVideo === hashVideo);
  if (igual) return `o mesmo arquivo de vídeo já foi enviado como "${igual.episodio}" (${igual.videoId})`;
  return null;
}

export function registrar(pubs, item) {
  const agora = new Date().toISOString();
  const idx = pubs.itens.findIndex((i) => i.plataforma === item.plataforma && i.episodio === item.episodio);
  const antigo = idx >= 0 ? pubs.itens[idx] : { historico: [] };
  const novo = { ...antigo, ...item, atualizadoEm: agora };
  novo.historico = [...(antigo.historico ?? []), { em: agora, status: item.status, nota: item.nota ?? undefined }].slice(-20);
  delete novo.nota;
  if (idx >= 0) pubs.itens[idx] = novo;
  else pubs.itens.push(novo);
  return novo;
}

// ---------------------------------------------------------------------- cota

const COTA = "cota.json";

/** Dia da cota do YouTube (zera à meia-noite no horário do Pacífico). */
export function diaPacifico(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export class Cota {
  constructor(cfg, { gravar = true } = {}) {
    this.cfg = cfg;
    this.gravarAoFim = gravar;
    const salvo = lerJson(COTA, {});
    const hoje = diaPacifico();
    this.estado = salvo.youtube?.dia === hoje ? salvo.youtube : { dia: hoje, unidades: 0, envios: 0, chamadas: {} };
  }
  custo(metodo) {
    return this.cfg.custos?.[metodo] ?? 1;
  }
  /** Lança erro se a chamada estourar o limite configurado. */
  reservar(metodo, vezes = 1) {
    const u = this.custo(metodo) * vezes;
    if (metodo === "videos.insert" && this.estado.envios + vezes > (this.cfg.limiteEnviosDia ?? 10))
      throw new ErroCota(`limite de ${this.cfg.limiteEnviosDia} envios de vídeo por dia atingido`);
    if (metodo !== "videos.insert" && this.estado.unidades + u > (this.cfg.limiteDiario ?? 9000))
      throw new ErroCota(`limite diário de ${this.cfg.limiteDiario} unidades de cota atingido`);
    if (metodo === "videos.insert") this.estado.envios += vezes;
    else this.estado.unidades += u;
    this.estado.chamadas[metodo] = (this.estado.chamadas[metodo] ?? 0) + vezes;
  }
  salvar() {
    if (this.gravarAoFim) gravarJson(COTA, { _leia: "Gerado automaticamente. Uso estimado da cota do YouTube hoje.", youtube: this.estado });
  }
}

export class ErroCota extends Error {}
