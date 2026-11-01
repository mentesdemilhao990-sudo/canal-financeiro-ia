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
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseEpisode } from "../src/lib/schema.mjs";
import { problemasMetadata, youtubeMetadata } from "./lib/metadata.mjs";
import { Cota, buscarPublicacao, checarDuplicado, hashEpisodio, lerPublicacoes, gravarPublicacoes, registrar, sha256, quando } from "./lib/estado.mjs";
import { YouTube, credenciaisDoAmbiente } from "./lib/youtube-api.mjs";
import { modos, motivoSimulacao } from "./lib/modos.mjs";
import { semAcento } from "./lib/metadata.mjs";
import { horaBrasilia, horariosAleatorios, hojeEmBrasilia } from "./lib/horarios.mjs";

const mesmoCanal = (a, b) => semAcento(String(a)).toLowerCase().trim() === semAcento(String(b)).toLowerCase().trim();

const cfg = JSON.parse(readFileSync(process.env.PUBLICACAO_CONFIG ?? "config/publicacao.json", "utf8"));
const [cmd, ...resto] = process.argv.slice(2);
const opt = (nome, def) => {
  const i = resto.indexOf(nome);
  return i >= 0 ? resto[i + 1] : def;
};
const saida = opt("--saida", "out");
const visibilidadePedida = opt("--visibilidade", "privado");
// --horario aleatorio: cada vídeo público sai numa hora sorteada do dia (janela em config/publicacao.json).
const horarioPedido = opt("--horario", "agora");
const resumo = (linha) => {
  console.log(linha);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${linha}\n`);
};

const todosEpisodios = () => readdirSync("episodes").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const carregar = (id) => parseEpisode(JSON.parse(readFileSync(`episodes/${id}.json`, "utf8")), `episodes/${id}.json`);
const listaPedida = (txt) => (txt ?? "").split(",").map((s) => s.trim().replace(/\.json$/, "").replace(/^episodes\//, "")).filter(Boolean);

function selecionar(pedido) {
  if (pedido === "nenhum") return [];
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
  if (!["privado", "publico"].includes(visibilidadePedida)) throw new Error('--visibilidade aceita "privado" ou "publico"');
  if (visibilidadePedida === "publico" && m.credenciais && !m.publicoDireto)
    throw new Error("envio direto como público só é permitido pela pauta diária (workflow Vídeos do dia)");
  if (!["agora", "aleatorio"].includes(horarioPedido)) throw new Error('--horario aceita "agora" ou "aleatorio"');
  if (horarioPedido === "aleatorio" && visibilidadePedida !== "publico") throw new Error("--horario aleatorio só vale com --visibilidade publico");
  const publico = real && visibilidadePedida === "publico";
  const rotulo = publico ? "público" : "privado";
  const { _leia, ...janela } = cfg.youtube.horarioAleatorio ?? {};
  const dia = ids.map((i) => /^\d{4}-\d{2}-\d{2}/.exec(i)?.[0]).find(Boolean) ?? hojeEmBrasilia();
  const horarios = horarioPedido === "aleatorio" ? horariosAleatorios(ids, { dia, ...janela, agora: process.env.AGORA_TESTE ? new Date(process.env.AGORA_TESTE) : new Date() }) : {};
  const pubs = lerPublicacoes();
  const cota = new Cota(cfg.cota);
  const yt = real ? new YouTube({ credenciais: credenciaisDoAmbiente(), cota }) : null;
  resumo(`## 📤 Publicação no YouTube · ${real ? `**ENVIO REAL (${rotulo})**` : "simulação"}`);
  if (!real) resumo(`> Nada foi enviado: ${motivoSimulacao(m, "publicacao")}.`);
  if (m.pedidos.publicacao && !m.credenciais) throw new Error(
      "O envio foi autorizado, mas os Secrets YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET e YOUTUBE_REFRESH_TOKEN chegaram vazios. Confira se os nomes são exatamente esses e se estão em Settings → Secrets and variables → Actions → aba Secrets → Repository secrets (não em Environments, Codespaces ou Dependabot).",
    );

  let canal;
  let recentes = [];
  if (real) {
    canal = await yt.meuCanal();
    resumo(`Canal: **${canal.nome}** (${canal.id})`);
    if (cfg.youtube.canalEsperado && !mesmoCanal(canal.nome, cfg.youtube.canalEsperado))
      throw new Error(`o login é do canal “${canal.nome}”, mas o esperado é “${cfg.youtube.canalEsperado}” (config/publicacao.json). Nada foi enviado.`);
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
        const quandoSim = horarios[id] ? ` às ${horaBrasilia(horarios[id])} (Brasília)` : "";
        resumo(`- 🧪 **${id}**: enviaria como ${visibilidadePedida === "publico" ? "público" : "privado"}${quandoSim} → “${meta.title}” · ${meta.tags.length} tags · ${meta.hashtags.map((h) => `#${h}`).join(" ")}`);
        continue;
      }
      // Marca "enviando" ANTES de subir: se o job morrer no meio, a próxima execução não duplica.
      registrar(pubs, { ...base, status: "enviando" });
      gravarPublicacoes(pubs);
      const publicarEm = publico ? horarios[id] ?? null : null;
      if (publicarEm) {
        const v = await yt.enviarVideo(mp4, meta, { privacidade: "private", notificar: true, publicarEm });
        let agendadoPara = v.status?.publishAt;
        registrar(pubs, { ...base, status: "privado", privacidade: v.status?.privacyStatus, videoId: v.id, url: `https://youtu.be/${v.id}`, enviadoEm: new Date().toISOString(), nota: "enviado (agendando)" });
        gravarPublicacoes(pubs);
        if (!agendadoPara) {
          const u = await yt.mudarVisibilidade(v.id, "public", { publicarEm, madeForKids: cfg.youtube.madeForKids });
          agendadoPara = u.status?.publishAt;
        }
        if (!agendadoPara) throw new Error(`o vídeo subiu (https://youtu.be/${v.id}) mas o YouTube não aceitou o agendamento; ficou privado.`);
        registrar(pubs, { ...base, status: "agendado", privacidade: "private", videoId: v.id, url: `https://youtu.be/${v.id}`, publicarEm: new Date(agendadoPara).toISOString(), nota: `fica público às ${horaBrasilia(new Date(agendadoPara))} (Brasília)` });
        resumo(`- ⏰ **${id}** enviado e agendado: fica **público às ${horaBrasilia(new Date(agendadoPara))}** (Brasília): https://youtu.be/${v.id}`);
        continue;
      }
      const v = await yt.enviarVideo(mp4, meta, { privacidade: publico ? "public" : "private", notificar: publico });
      let priv = v.status?.privacyStatus ?? (publico ? "public" : "private");
      registrar(pubs, { ...base, status: "privado", privacidade: priv, videoId: v.id, url: `https://youtu.be/${v.id}`, enviadoEm: new Date().toISOString(), nota: `enviado (${priv})` });
      gravarPublicacoes(pubs);
      if (publico && priv !== "public") {
        // O YouTube às vezes guarda como privado; tenta tornar público na hora.
        const u = await yt.mudarVisibilidade(v.id, "public", { madeForKids: cfg.youtube.madeForKids });
        priv = u.status?.privacyStatus ?? priv;
      }
      const status = priv === "public" ? "publico" : "privado";
      registrar(pubs, { ...base, status, privacidade: priv, videoId: v.id, url: `https://youtu.be/${v.id}`, nota: `publicado (${priv})` });
      if (publico && status !== "publico") throw new Error(`o vídeo subiu (https://youtu.be/${v.id}) mas o YouTube deixou como ${priv}. Projetos do Google Cloud sem auditoria podem ter envios travados como privados.`);
      resumo(`- ✅ **${id}** enviado como **${status === "publico" ? "público" : "privado"}**: https://youtu.be/${v.id}`);
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

/**
 * Junta o pedido da execução: entradas manuais, arquivo pedidos/youtube.json (push)
 * ou agenda diária. Confere que a execução reaproveitada terminou com sucesso
 * (ou seja, o MP4 passou em todos os testes de áudio e vídeo).
 */
async function lerPedido() {
  const ev = process.env.EVENTO;
  let p = { episodios: "agendados", confirmacao: "", execucao: "" };
  if (ev === "workflow_dispatch") p = { episodios: process.env.IN_EPISODIOS || "agendados", confirmacao: process.env.IN_CONFIRMACAO ?? "", execucao: process.env.IN_EXECUCAO ?? "" };
  if (ev === "push") {
    const arq = JSON.parse(readFileSync(process.env.PEDIDO_YOUTUBE ?? "pedidos/youtube.json", "utf8"));
    p = { episodios: arq.episodios ?? "agendados", confirmacao: arq.confirmacao ?? "", execucao: String(arq.reaproveitarExecucao ?? "") };
    // Arquivo sem confirmação não dispara nada (nem simulação, para não gastar minutos).
    if (p.confirmacao.trim() !== "ENVIAR-PRIVADO") p = { episodios: "nenhum", confirmacao: "", execucao: "" };
  }
  p.execucao = String(p.execucao).trim();
  if (p.execucao && !/^\d+$/.test(p.execucao)) throw new Error(`execução para reaproveitar inválida: "${p.execucao}"`);
  if (p.execucao) {
    const token = process.env.GITHUB_TOKEN;
    const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${p.execucao}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    });
    const run = await r.json();
    if (!r.ok) throw new Error(`não achei a execução ${p.execucao}: ${run.message ?? r.status}`);
    if (run.conclusion !== "success") throw new Error(`a execução ${p.execucao} terminou como "${run.conclusion}"; só reaproveito vídeo que passou em todos os testes`);
    // Só reaproveita se nada que muda o vídeo foi alterado desde aquela execução.
    const MUDAM_VIDEO = ["src", "public", "episodes", "scripts/build-episode.mjs", "scripts/tts.py", "config/channel.json", "package-lock.json", "remotion.config.ts", "requirements.txt"];
    const d = spawnSync("git", ["diff", "--name-only", run.head_sha, "HEAD", "--", ...MUDAM_VIDEO], { encoding: "utf8" });
    if (d.status !== 0) throw new Error(`não consegui comparar o código com a execução ${p.execucao} (${d.stderr.trim()}). Renderize de novo, sem reaproveitar.`);
    if (d.stdout.trim())
      throw new Error(`o gerador de vídeo ou o episódio mudou desde a execução ${p.execucao} (${d.stdout.trim().split("\n").join(", ")}). Não reaproveito: deixe reaproveitar_execucao vazio para renderizar de novo.`);
    resumo(`♻️ Reaproveitando o MP4 da execução [${p.execucao}](${run.html_url}) (${run.name}, ${run.head_branch}).`);
  }
  const conf = p.confirmacao.trim() === "ENVIAR-PRIVADO";
  resumo(`Pedido: \`${p.episodios}\` · ${conf ? "envio real autorizado nesta execução (privado)" : "sem confirmação: simulação, a não ser que YOUTUBE_PUBLICACAO esteja ligada"}`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `episodios=${p.episodios.replace(/[\r\n]/g, "")}\nconfirmacao=${conf ? "ENVIAR-PRIVADO" : ""}\nexecucao=${p.execucao}\n`);
}

try {
  if (cmd === "selecionar") {
    const lista = selecionar(resto[0]);
    console.log(JSON.stringify(lista));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `lista=${JSON.stringify(lista)}\ncsv=${lista.join(",")}\n`);
  } else if (cmd === "pedido") {
    await lerPedido();
  } else if (cmd === "testar-conexao") {
    // Só leitura: faz login e mostra o canal. Não envia nem muda nada.
    const cred = credenciaisDoAmbiente();
    if (!cred) throw new Error("Faltam os Secrets YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET e YOUTUBE_REFRESH_TOKEN.");
    const cota = new Cota(cfg.cota);
    const canal = await new YouTube({ credenciais: cred, cota }).meuCanal();
    cota.salvar();
    resumo(`✅ Conexão OK com o canal **${canal.nome}** (${canal.id}). Nada foi enviado.`);
    if (cfg.youtube.canalEsperado && !mesmoCanal(canal.nome, cfg.youtube.canalEsperado)) {
      resumo(`❌ O canal esperado é “${cfg.youtube.canalEsperado}”. Envios ficam bloqueados até conferir.`);
      process.exitCode = 1;
    }
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
