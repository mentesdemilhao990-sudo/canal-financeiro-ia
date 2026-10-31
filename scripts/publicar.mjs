#!/usr/bin/env node
// Publicação no YouTube. Sem as chaves ligadas, só SIMULA (não envia nada).
//
//   node scripts/publicar.mjs selecionar [agendados | ep1,ep2]   -> lista JSON do que enviar agora
//   node scripts/publicar.mjs metadados <episodio>                -> mostra título/descrição/tags
//   node scripts/publicar.mjs enviar ep1,ep2 [--saida out]        -> envia (privado) ou simula
//   node scripts/publicar.mjs testar-conexao                     -> só confere o login (não envia nada)
//   node scripts/publicar.mjs visibilidade <episodio> <publico|nao_listado|privado|agendado> [data]
//
// Todo vídeo sobe como PRIVADO. Tornar público é sempre um passo seu (visibilidade).
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseEpisode } from "../src/lib/schema.mjs";
import { problemasMetadata, youtubeMetadata } from "./lib/metadata.mjs";
import { Cota, buscarPublicacao, checarDuplicado, hashEpisodio, lerPublicacoes, gravarPublicacoes, registrar, sha256, quando } from "./lib/estado.mjs";
import { YouTube, credenciaisDoAmbiente } from "./lib/youtube-api.mjs";
import { modos, motivoSimulacao } from "./lib/modos.mjs";

const cfg = JSON.parse(readFileSync(process.env.PUBLICACAO_CONFIG ?? "config/publicacao.json", "utf8"));
const [cmd, ...resto] = process.argv.slice(2);
const opt = (nome, def) => {
  const i = resto.indexOf(nome);
  return i >= 0 ? resto[i + 1] : def;
};
const saida = opt("--saida", "out");
const resumo = (linha) => {
  console.log(linha);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${linha}\n`);
};

const todosEpisodios = () => readdirSync("episodes").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const carregar = (id) => parseEpisode(JSON.parse(readFileSync(`episodes/${id}.json`, "utf8")), `episodes/${id}.json`);
const listaPedida = (txt) => (txt ?? "").split(",").map((s) => s.trim().replace(/\.json$/, "").replace(/^episodes\//, "")).filter(Boolean);

function selecionar(pedido) {
  const pubs = lerPublicacoes();
  const agora = new Date();
  let lista;
  if (!pedido || pedido === "agendados") {
    lista = todosEpisodios().filter((id) => {
      const d = quando(carregar(id).publicacao?.youtube?.enviarEm);
      return d && d <= agora;
    });
  } else {
    lista = pedido === "todos" ? todosEpisodios() : listaPedida(pedido);
    const faltando = lista.filter((e) => !todosEpisodios().includes(e));
    if (faltando.length) throw new Error(`Episódio não encontrado em episodes/: ${faltando.join(", ")}`);
  }
  const prontos = [];
  for (const id of lista) {
    const dup = checarDuplicado(pubs, { plataforma: "youtube", episodio: id });
    if (dup) console.error(`· pulando ${id}: ${dup}`);
    else prontos.push(id);
  }
  const max = cfg.youtube.maxEnviosPorExecucao ?? 2;
  if (prontos.length > max) console.error(`· limite de ${max} envios por execução: ficam para a próxima ${prontos.slice(max).join(", ")}`);
  return prontos.slice(0, max);
}

async function enviar(ids) {
  const m = modos();
  const real = m.publicacao;
  const pubs = lerPublicacoes();
  const cota = new Cota(cfg.cota);
  const yt = real ? new YouTube({ credenciais: credenciaisDoAmbiente(), cota }) : null;
  resumo(`## 📤 Publicação no YouTube · ${real ? "**ENVIO REAL (privado)**" : "simulação"}`);
  if (!real) resumo(`> Nada foi enviado: ${motivoSimulacao(m, "publicacao")}.`);
  if (m.pedidos.publicacao && !m.credenciais) throw new Error("YOUTUBE_PUBLICACAO está ligada, mas faltam as credenciais nos Secrets.");

  let canal;
  let recentes = [];
  if (real) {
    canal = await yt.meuCanal();
    resumo(`Canal: **${canal.nome}** (${canal.id})`);
    if (cfg.youtube.verificarTitulosRecentesNoCanal) recentes = await yt.titulosRecentes(canal.uploads);
  }

  let falhas = 0;
  for (const id of ids) {
    try {
      const ep = carregar(id);
      const dir = path.join(saida, id);
      const mp4 = path.join(dir, `${id}.mp4`);
      if (!existsSync(mp4)) throw new Error(`não achei ${mp4}. Rode a renderização antes.`);
      const info = existsSync(path.join(dir, `${id}-info.json`)) ? JSON.parse(readFileSync(path.join(dir, `${id}-info.json`), "utf8")) : {};
      const meta = youtubeMetadata(ep, cfg.youtube, info);
      const problemas = problemasMetadata(meta);
      if (problemas.length) throw new Error(`metadados inválidos: ${problemas.join("; ")}`);
      writeFileSync(path.join(dir, `${id}-youtube.json`), JSON.stringify(meta, null, 2));

      if (real && /piper/.test(info.engine ?? "") === false) throw new Error("o vídeo foi gerado com narração de teste (--mock); não envio isso ao canal");
      const hashVideo = sha256(readFileSync(mp4)).slice(0, 16);
      const dup = checarDuplicado(pubs, { plataforma: "youtube", episodio: id, hashVideo });
      if (dup) {
        resumo(`- ⏭️ **${id}**: ${dup}`);
        continue;
      }
      const noCanal = recentes.find((r) => r.titulo.trim().toLowerCase() === meta.title.trim().toLowerCase());
      if (noCanal) {
        registrar(pubs, { plataforma: "youtube", episodio: id, status: "privado", videoId: noCanal.videoId, titulo: meta.title, hashEpisodio: hashEpisodio(ep), hashVideo, url: `https://youtu.be/${noCanal.videoId}`, nota: "já existia no canal com o mesmo título; registrado sem reenviar" });
        resumo(`- ⏭️ **${id}**: já existe no canal com o mesmo título (${noCanal.videoId}). Registrei e não reenviei.`);
        continue;
      }

      const base = { plataforma: "youtube", episodio: id, titulo: meta.title, hashEpisodio: hashEpisodio(ep), hashVideo, duracao: info.duration };
      if (!real) {
        if (!buscarPublicacao(pubs, "youtube", id)) registrar(pubs, { ...base, status: "simulado", nota: "simulação: nada enviado" });
        resumo(`- 🧪 **${id}**: enviaria como privado → “${meta.title}” · ${meta.tags.length} tags · ${meta.hashtags.map((h) => `#${h}`).join(" ")}`);
        continue;
      }
      // Marca "enviando" ANTES de subir: se o job morrer no meio, a próxima execução não duplica.
      registrar(pubs, { ...base, status: "enviando" });
      gravarPublicacoes(pubs);
      const v = await yt.enviarVideo(mp4, meta);
      registrar(pubs, { ...base, status: "privado", privacidade: v.status?.privacyStatus ?? "private", videoId: v.id, url: `https://youtu.be/${v.id}`, enviadoEm: new Date().toISOString(), nota: "enviado como privado" });
      resumo(`- ✅ **${id}** enviado como **privado**: https://youtu.be/${v.id}`);
    } catch (e) {
      falhas++;
      resumo(`- ❌ **${id}**: ${e.message}`);
      const p = buscarPublicacao(pubs, "youtube", id);
      if (p?.status === "enviando" && e.status) registrar(pubs, { ...p, status: "erro", nota: e.message });
    } finally {
      gravarPublicacoes(pubs);
      cota.salvar();
    }
  }
  if (falhas) process.exitCode = 1;
}

async function visibilidade(id, para, data) {
  const mapa = { publico: "public", nao_listado: "unlisted", privado: "private", agendado: "private" };
  if (!mapa[para]) throw new Error("Use: publico, nao_listado, privado ou agendado");
  if (para === "agendado" && !quando(data)) throw new Error("Para agendar, informe a data: 2026-11-05T18:00");
  const publicarEm = para === "agendado" ? quando(data) : null;
  if (publicarEm && publicarEm <= new Date()) throw new Error("A data do agendamento precisa estar no futuro.");
  const pubs = lerPublicacoes();
  const p = buscarPublicacao(pubs, "youtube", id) ?? pubs.itens.find((i) => i.videoId === id);
  if (!p?.videoId) throw new Error(`Não há vídeo enviado de verdade para "${id}".`);
  const m = modos();
  if (!m.publicacao) {
    resumo(`🧪 Simulação: mudaria ${p.episodio} (${p.videoId}) para ${para}${publicarEm ? ` em ${publicarEm.toISOString()}` : ""}. Motivo: ${motivoSimulacao(m, "publicacao")}.`);
    return;
  }
  const cota = new Cota(cfg.cota);
  const yt = new YouTube({ credenciais: credenciaisDoAmbiente(), cota });
  try {
    const v = await yt.mudarVisibilidade(p.videoId, mapa[para], { publicarEm, madeForKids: cfg.youtube.madeForKids });
    registrar(pubs, { ...p, status: para, privacidade: v.status?.privacyStatus, publicarEm: publicarEm?.toISOString(), nota: `visibilidade: ${para}` });
    resumo(`✅ ${p.episodio} agora está **${para}**${publicarEm ? ` (vai ao ar em ${publicarEm.toISOString()})` : ""}: ${p.url}`);
  } catch (e) {
    if (e.status === 403 || /forbidden|locked/i.test(e.message))
      e.message += ". Se o projeto do Google Cloud ainda não passou pela auditoria do YouTube, vídeos enviados pela API ficam travados como privados (veja o passo 9 do tutorial).";
    throw e;
  } finally {
    gravarPublicacoes(pubs);
    cota.salvar();
  }
}

try {
  if (cmd === "selecionar") {
    const lista = selecionar(resto[0]);
    console.log(JSON.stringify(lista));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `lista=${JSON.stringify(lista)}\ncsv=${lista.join(",")}\n`);
  } else if (cmd === "testar-conexao") {
    // Só leitura: faz login e mostra o canal. Não envia nem muda nada.
    const cred = credenciaisDoAmbiente();
    if (!cred) throw new Error("Faltam os Secrets YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET e YOUTUBE_REFRESH_TOKEN.");
    const cota = new Cota(cfg.cota);
    const canal = await new YouTube({ credenciais: cred, cota }).meuCanal();
    cota.salvar();
    resumo(`✅ Conexão OK com o canal **${canal.nome}** (${canal.id}). Nada foi enviado.`);
    const m = modos();
    resumo(`Publicação: ${m.publicacao ? "ligada" : `desligada (${motivoSimulacao(m, "publicacao")})`}.`);
  } else if (cmd === "metadados") {
    console.log(JSON.stringify(youtubeMetadata(carregar(resto[0]), cfg.youtube), null, 2));
  } else if (cmd === "enviar") {
    await enviar(listaPedida(resto[0]));
  } else if (cmd === "visibilidade") {
    await visibilidade(resto[0], resto[1], resto[2]);
  } else {
    console.error("Comandos: selecionar | metadados | enviar | visibilidade | testar-conexao");
    process.exitCode = 2;
  }
} catch (e) {
  console.error(`::error::${e.message}`);
  process.exitCode = 1;
}
