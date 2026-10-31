#!/usr/bin/env node
// Pauta do dia: escolhe o tema de educação financeira mais em alta e escreve
// dois roteiros sobre ele (um vídeo longo horizontal e um Short vertical).
//
//   node scripts/pauta-diaria.mjs            -> grava episodes/<data>-<tema>-longo.json e -short.json
//   node scripts/pauta-diaria.mjs ranking    -> só mostra a pontuação dos temas (não escreve nada)
//
// Saída para o GitHub Actions: csv=<longo>,<short> (vazio se hoje já foi publicado).
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { coletar, escolher, pontuar } from "./lib/tendencias.mjs";
import { escreverEpisodio } from "./lib/roteirista.mjs";
import { STATUS_REAIS, gravarJson, lerJson, lerPublicacoes } from "./lib/estado.mjs";

const cfg = JSON.parse(readFileSync(process.env.TEMAS_CONFIG ?? "config/temas.json", "utf8"));
const cmd = process.argv[2] ?? "gerar";

const resumo = (linha = "") => {
  console.log(linha);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${linha}\n`);
};
const saida = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

/** Data de hoje em Brasília (AAAA-MM-DD). */
export const hojeBrasilia = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

const PAUTAS = "pautas.json";
const pautas = lerJson(PAUTAS, { _leia: "Gerado automaticamente. Temas já usados pela pauta diária, para não repetir.", itens: [] });
const pubs = lerPublicacoes();
const hoje = hojeBrasilia();

const publicadoHoje = pubs.itens.filter((i) => i.episodio?.startsWith(`${hoje}-`) && STATUS_REAIS.includes(i.status));
if (cmd === "gerar" && publicadoHoje.length && process.env.FORCAR !== "sim") {
  resumo(`## 🗓️ Pauta de ${hoje}`);
  resumo(`Hoje já saiu: ${publicadoHoje.map((i) => `${i.episodio} (${i.url ?? i.status})`).join(", ")}. Nada a fazer.`);
  saida("csv", "");
  process.exit(0);
}

const fontes = await coletar(cfg.buscasNoticias ?? []);
const ranking = pontuar(cfg.temas, fontes, { usados: pautas.itens, diasSemRepetir: cfg.diasSemRepetir ?? 30 });
const escolhido = escolher(ranking);

resumo(`## 🗓️ Pauta de ${hoje}`);
resumo(`Fontes: ${fontes.trends.length} buscas em alta no Google, ${fontes.noticias.length} manchetes das últimas 48 h.${fontes.erros.length ? ` Falhas: ${fontes.erros.join("; ")}` : ""}`);
resumo("");
resumo("| Tema | Pontos | Buscas em alta | Manchetes | Época | Livre? |");
resumo("| --- | --- | --- | --- | --- | --- |");
for (const r of ranking.slice(0, 10))
  resumo(`| ${r.tema.nome} | ${r.pontos} | ${r.detalhe.buscasEmAlta.slice(0, 3).join(", ") || "–"} | ${r.detalhe.manchetes} | ${r.detalhe.epoca ? "sim" : "–"} | ${r.bloqueado ? `usado há ${Math.floor(r.diasDesdeUltimoUso)} dias` : "sim"} |`);
resumo("");
resumo(`**Escolhido:** ${escolhido.tema.nome} (${escolhido.pontos} pontos)`);

if (cmd === "ranking") process.exit(0);

const titulosUsados = [...pubs.itens.map((i) => i.titulo), ...pautas.itens.flatMap((p) => p.titulos ?? [])].filter(Boolean);
const base = `${hoje}-${escolhido.tema.id}`;
const ids = { longo: `${base}-longo`, short: `${base}-short` };

console.log("\n▶ Roteiro do vídeo longo");
const longo = await escreverEpisodio({ tema: escolhido.tema, manchetes: escolhido.manchetes, formato: "longo", id: ids.longo, titulosUsados });
console.log("\n▶ Roteiro do Short");
const short = await escreverEpisodio({ tema: escolhido.tema, manchetes: escolhido.manchetes, formato: "short", id: ids.short, tituloIrmao: longo.episodio.title, titulosUsados });

for (const r of [longo, short]) writeFileSync(`episodes/${r.bruto.id}.json`, `${JSON.stringify(r.bruto, null, 2)}\n`);

pautas.itens.push({
  data: hoje,
  tema: escolhido.tema.id,
  nome: escolhido.tema.nome,
  pontos: escolhido.pontos,
  manchetes: escolhido.manchetes.slice(0, 5),
  episodios: [ids.longo, ids.short],
  titulos: [longo.episodio.title, short.episodio.title],
  modelo: longo.modelo,
});
pautas.itens = pautas.itens.slice(-400);
gravarJson(PAUTAS, pautas);

resumo("");
resumo(`- 🎬 Vídeo longo: **${longo.episodio.title}** · ${longo.episodio.scenes.length} cenas · ~${longo.episodio.targetDurationSeconds} s · ${longo.modelo} (tentativa ${longo.tentativas})`);
resumo(`- 📱 Short: **${short.episodio.title}** · ${short.episodio.scenes.length} cenas · ~${short.episodio.targetDurationSeconds} s · ${short.modelo} (tentativa ${short.tentativas})`);
saida("csv", `${ids.longo},${ids.short}`);
saida("tema", escolhido.tema.nome.replace(/[\r\n]/g, " "));
