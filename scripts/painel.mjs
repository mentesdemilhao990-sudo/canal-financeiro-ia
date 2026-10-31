#!/usr/bin/env node
// Painel de controle: gera PAINEL.md (abre direto no GitHub, até no celular)
// e out/painel/index.html (mesmo conteúdo, para baixar ou publicar no Pages).
//
//   node scripts/painel.mjs
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseEpisode } from "../src/lib/schema.mjs";
import { diaPacifico, lerJson, lerPublicacoes, quando, STATUS_REAIS } from "./lib/estado.mjs";
import { CHAVES, modos } from "./lib/modos.mjs";
import { PLATAFORMAS } from "./platforms/index.mjs";

const cfg = JSON.parse(readFileSync(process.env.PUBLICACAO_CONFIG ?? "config/publicacao.json", "utf8"));

export function montarPainel({ pubs, coments, cota, episodios, modo, estat = { videos: {} }, agora = new Date() }) {
  const ICONE = { publico: "🟢 público", nao_listado: "🔗 não listado", agendado: "⏰ agendado", privado: "🔒 privado", enviando: "⏳ enviando", simulado: "🧪 simulado", erro: "❌ erro" };
  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/@/g, "@​").replace(/[<>]/g, "");
  const data = (s) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");
  const L = [];

  L.push("# 📊 Painel · Mente de Milhão", "", `_Atualizado em ${data(agora.toISOString())} (Brasília). Este arquivo é gerado sozinho: não edite à mão._`, "");

  L.push("## Chaves de segurança", "", "| O quê | Situação |", "| --- | --- |");
  L.push(`| Credenciais do YouTube (Secrets) | ${modo.credenciais ? "✅ configuradas" : "⚪ ainda não"} |`);
  for (const [k, c] of Object.entries(CHAVES)) {
    const on = k === "automatica" ? modo.automatica : modo[k];
    L.push(`| ${c.oQueFaz} | ${on ? "🟢 **ligado**" : `⚪ desligado (\`${c.variavel}\`)`} |`);
  }
  L.push("", "Com tudo desligado, os workflows só **simulam**: nada é enviado nem respondido.", "");

  const c = cota?.youtube;
  const hoje = diaPacifico(agora);
  const usado = c?.dia === hoje ? c : { unidades: 0, envios: 0 };
  L.push("## Cota do YouTube hoje", "", `${usado.unidades} de ${cfg.cota.limiteDiario} unidades · ${usado.envios} de ${cfg.cota.limiteEnviosDia} envios de vídeo (zera à meia-noite do Pacífico, 4h ou 5h em Brasília).`, "");

  const yt = pubs.itens.filter((i) => i.plataforma === "youtube");
  L.push("## Vídeos", "");
  if (!yt.length) L.push("Nenhum envio registrado ainda.", "");
  else {
    L.push("| Episódio | Título | Status | Link | Views | 👍 | 💬 | Atualizado |", "| --- | --- | --- | --- | ---: | ---: | ---: | --- |");
    for (const v of [...yt].sort((a, b) => (b.atualizadoEm ?? "").localeCompare(a.atualizadoEm ?? ""))) {
      const e = estat.videos?.[v.videoId] ?? {};
      const st = e.status ?? v.status;
      L.push(`| \`${v.episodio}\` | ${esc(v.titulo)} | ${ICONE[st] ?? st} | ${v.videoId ? `[abrir](https://youtu.be/${v.videoId})` : "—"} | ${e.views ?? "—"} | ${e.likes ?? "—"} | ${e.comentarios ?? "—"} | ${data(v.atualizadoEm)} |`);
    }
    L.push("");
  }

  const enviados = new Set(yt.filter((i) => STATUS_REAIS.includes(i.status)).map((i) => i.episodio));
  const fila = episodios.filter((e) => !enviados.has(e.id));
  L.push("## Episódios ainda não enviados", "");
  if (!fila.length) L.push("Todos os episódios já foram enviados.", "");
  else {
    L.push("| Episódio | Envio agendado (YouTube) |", "| --- | --- |");
    for (const e of fila) {
      const d = e.publicacao?.youtube?.enviarEm;
      L.push(`| \`${e.id}\` | ${d ? `${data(quando(d).toISOString())}${quando(d) <= agora ? " (já pode ir)" : ""}` : "sem data: só envio manual"} |`);
    }
    L.push("");
  }

  const itens = coments.itens ?? [];
  const conta = (f) => itens.filter(f).length;
  L.push("## Comentários", "", `Última leitura: ${data(coments.ultimaLeitura)}`, "");
  L.push("| Aguardando você | 💰 Financeiras (revisão obrigatória) | Aprovadas, não enviadas | Respondidas | Automáticas | Ignoradas |", "| ---: | ---: | ---: | ---: | ---: | ---: |");
  L.push(`| ${conta((x) => x.status === "pendente")} | ${conta((x) => x.status === "pendente" && x.revisaoObrigatoria)} | ${conta((x) => x.status === "aprovado")} | ${conta((x) => x.status === "respondido")} | ${conta((x) => x.status === "auto")} | ${conta((x) => ["ignorado", "ignorar_sugerido"].includes(x.status))} |`, "");
  const pend = itens.filter((x) => x.status === "pendente").sort((a, b) => b.revisaoObrigatoria - a.revisaoObrigatoria).slice(0, 15);
  if (pend.length) {
    L.push("Para aprovar, abra a issue **💬 Comentários para aprovar** (aba Issues) e marque as caixas.", "");
    L.push("| Autor | Comentário | Tipo | Sugestão |", "| --- | --- | --- | --- |");
    for (const x of pend) L.push(`| ${esc(x.autor)} | ${esc(x.texto).slice(0, 120)} | ${x.revisaoObrigatoria ? "💰 **revisar**" : x.categoria} | ${esc(x.sugestao).slice(0, 120)} |`);
    L.push("");
  }
  const ult = itens.filter((x) => ["respondido", "auto"].includes(x.status)).sort((a, b) => (b.respondidoEm ?? "").localeCompare(a.respondidoEm ?? "")).slice(0, 10);
  if (ult.length) {
    L.push("### Últimas respostas", "", "| Quando | Autor | Resposta | Como |", "| --- | --- | --- | --- |");
    for (const x of ult) L.push(`| ${data(x.respondidoEm)} | ${esc(x.autor)} | ${esc(x.resposta).slice(0, 100)} | ${x.origem ?? x.status} |`);
    L.push("");
  }

  L.push("## Plataformas", "", "| Plataforma | Situação |", "| --- | --- |");
  for (const p of Object.values(PLATAFORMAS)) L.push(`| ${p.nome} | ${p.situacao} |`);
  L.push("");
  return L.join("\n");
}

/** Markdown simples -> HTML (só o que o painel usa: títulos, tabelas, parágrafos, negrito, links, código). */
export function paraHtml(md) {
  const inline = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/_(.+?)_/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\[(.+?)\]\((https:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\\\|/g, "|");
  const out = [];
  const linhas = md.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (/^#{1,3} /.test(l)) {
      const n = l.match(/^#+/)[0].length;
      out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`);
    } else if (l.startsWith("|")) {
      const linhasT = [];
      while (i < linhas.length && linhas[i].startsWith("|")) linhasT.push(linhas[i++]);
      i--;
      const cel = (r) => r.slice(1, -1).split(/(?<!\\)\|/).map((x) => x.trim());
      const [cab, , ...corpo] = linhasT;
      out.push(`<div class="t"><table><thead><tr>${cel(cab).map((x) => `<th>${inline(x)}</th>`).join("")}</tr></thead><tbody>${corpo.map((r) => `<tr>${cel(r).map((x) => `<td>${inline(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Painel do canal</title>
<style>
:root{--bg:#0d1117;--fg:#e6edf3;--mut:#8b949e;--line:#30363d;--card:#161b22;--acc:#3fb950}
@media (prefers-color-scheme: light){:root{--bg:#fff;--fg:#1f2328;--mut:#59636e;--line:#d1d9e0;--card:#f6f8fa;--acc:#1a7f37}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}
h1{font-size:24px}h2{font-size:18px;margin-top:28px;border-bottom:1px solid var(--line);padding-bottom:4px}
em{color:var(--mut)}a{color:var(--acc)}code{background:var(--card);padding:1px 5px;border-radius:4px}
.t{overflow-x:auto}table{border-collapse:collapse;width:100%;background:var(--card)}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
</style></head><body>${out.join("\n")}</body></html>`;
}

if (process.argv[1]?.endsWith("painel.mjs")) {
  const episodios = readdirSync("episodes")
    .filter((f) => f.endsWith(".json"))
    .map((f) => parseEpisode(JSON.parse(readFileSync(`episodes/${f}`, "utf8")), f));
  const md = montarPainel({
    pubs: lerPublicacoes(),
    coments: lerJson("comentarios.json", { itens: [] }),
    cota: lerJson("cota.json", {}),
    estat: lerJson("estatisticas.json", { videos: {} }),
    episodios,
    modo: modos(process.env, cfg),
  });
  writeFileSync("PAINEL.md", `${md}\n`);
  mkdirSync("out/painel", { recursive: true });
  writeFileSync("out/painel/index.html", paraHtml(md));
  console.log("Painel atualizado: PAINEL.md e out/painel/index.html");
}
