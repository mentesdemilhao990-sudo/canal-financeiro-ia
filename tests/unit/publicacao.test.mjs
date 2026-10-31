// Publicação e comentários de ponta a ponta, com YouTube FALSO (tests/helpers/youtube-falso.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checarDuplicado, diaPacifico, quando } from "../../scripts/lib/estado.mjs";
import { modos } from "../../scripts/lib/modos.mjs";

const EP = "guardar-nao-e-investir";
const CRED = { YOUTUBE_CLIENT_ID: "id", YOUTUBE_CLIENT_SECRET: "segredo", YOUTUBE_REFRESH_TOKEN: "token" };

function ambiente({ engine = "piper:pt_BR-faber-medium", cenario = {}, config } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "pub-"));
  mkdirSync(path.join(dir, "out", EP), { recursive: true });
  writeFileSync(path.join(dir, "out", EP, `${EP}.mp4`), Buffer.alloc(2048, 7));
  writeFileSync(path.join(dir, "out", EP, `${EP}-info.json`), JSON.stringify({ duration: 42, engine }));
  writeFileSync(path.join(dir, "cenario.json"), JSON.stringify(cenario));
  writeFileSync(path.join(dir, "chamadas.jsonl"), "");
  const cfgArq = path.join(dir, "publicacao.json");
  const cfg = JSON.parse(readFileSync("config/publicacao.json", "utf8"));
  writeFileSync(cfgArq, JSON.stringify(config ? config(cfg) : cfg));
  return dir;
}

function rodar(dir, script, args, env = {}) {
  const r = spawnSync("node", ["--import", "./tests/helpers/youtube-falso.mjs", script, ...args], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      DATA_DIR: path.join(dir, "data"),
      CHAMADAS_ARQ: path.join(dir, "chamadas.jsonl"),
      CENARIO_ARQ: path.join(dir, "cenario.json"),
      PUBLICACAO_CONFIG: path.join(dir, "publicacao.json"),
      ...env,
    },
  });
  return { ...r, saida: r.stdout + r.stderr };
}
const chamadas = (dir) => readFileSync(path.join(dir, "chamadas.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ler = (dir, f) => JSON.parse(readFileSync(path.join(dir, "data", f), "utf8"));

test("sem credenciais e sem chave ligada: só simula, nenhuma chamada à internet", () => {
  for (const env of [{}, CRED, { YOUTUBE_PUBLICACAO: "ligada" }]) {
    const dir = ambiente();
    const r = rodar(dir, "scripts/publicar.mjs", ["enviar", EP, "--saida", path.join(dir, "out")], env);
    if (env.YOUTUBE_PUBLICACAO && !env.YOUTUBE_CLIENT_ID) {
      assert.match(r.saida, /chegaram vazios/);
      continue;
    }
    assert.equal(r.status, 0, r.saida);
    assert.match(r.saida, /simulação/);
    assert.deepEqual(chamadas(dir), []);
    assert.equal(ler(dir, "publicacoes.json").itens[0].status, "simulado");
  }
});

test("envio real (YouTube falso): sobe como PRIVADO, registra e não duplica", () => {
  const dir = ambiente();
  const env = { ...CRED, YOUTUBE_PUBLICACAO: "ligada" };
  const r = rodar(dir, "scripts/publicar.mjs", ["enviar", EP, "--saida", path.join(dir, "out")], env);
  assert.equal(r.status, 0, r.saida);
  const ini = chamadas(dir).find((c) => c.url.endsWith("/upload/youtube/v3/videos"));
  assert.equal(ini.corpo.status.privacyStatus, "private");
  assert.equal(ini.corpo.status.publishAt, undefined);
  assert.equal(ini.corpo.snippet.categoryId, "27");
  const reg = ler(dir, "publicacoes.json").itens[0];
  assert.equal(reg.status, "privado");
  assert.equal(reg.videoId, "VID123");
  assert.equal(ler(dir, "cota.json").youtube.envios, 1);
  assert.ok(existsSync(path.join(dir, "out", EP, `${EP}-youtube.json`)));

  // Segunda vez: nada é enviado.
  writeFileSync(path.join(dir, "chamadas.jsonl"), "");
  const r2 = rodar(dir, "scripts/publicar.mjs", ["enviar", EP, "--saida", path.join(dir, "out")], env);
  assert.match(r2.saida, /já foi enviado/);
  assert.equal(chamadas(dir).filter((c) => c.url.includes("/upload/")).length, 0);
  // E a seleção também já pula.
  assert.match(rodar(dir, "scripts/publicar.mjs", ["selecionar", EP]).stdout, /^\[\]/);
});

test("não envia vídeo feito com narração de teste (--mock)", () => {
  const dir = ambiente({ engine: "mock" });
  const r = rodar(dir, "scripts/publicar.mjs", ["enviar", EP, "--saida", path.join(dir, "out")], { ...CRED, YOUTUBE_PUBLICACAO: "ligada" });
  assert.notEqual(r.status, 0);
  assert.match(r.saida, /narração de teste/);
  assert.equal(chamadas(dir).filter((c) => c.url.includes("/upload/")).length, 0);
});

test("mesmo título já no canal: registra sem reenviar", () => {
  const titulo = JSON.parse(readFileSync(`episodes/${EP}.json`, "utf8")).title;
  const dir = ambiente({ cenario: { recentes: [{ snippet: { title: titulo, resourceId: { videoId: "JA_EXISTE" } } }] } });
  const r = rodar(dir, "scripts/publicar.mjs", ["enviar", EP, "--saida", path.join(dir, "out")], { ...CRED, YOUTUBE_PUBLICACAO: "ligada" });
  assert.equal(r.status, 0, r.saida);
  assert.equal(chamadas(dir).filter((c) => c.url.includes("/upload/")).length, 0);
  assert.equal(ler(dir, "publicacoes.json").itens[0].videoId, "JA_EXISTE");
});

test("envio interrompido bloqueia novo envio até conferir", () => {
  const pubs = { itens: [{ plataforma: "youtube", episodio: EP, status: "enviando" }] };
  assert.match(checarDuplicado(pubs, { plataforma: "youtube", episodio: EP }), /interrompido/);
  assert.equal(checarDuplicado({ itens: [{ plataforma: "youtube", episodio: EP, status: "simulado" }] }, { plataforma: "youtube", episodio: EP }), null);
});

test("visibilidade: agendar manda private + publishAt", () => {
  const dir = ambiente();
  const env = { ...CRED, YOUTUBE_PUBLICACAO: "ligada" };
  rodar(dir, "scripts/publicar.mjs", ["enviar", EP, "--saida", path.join(dir, "out")], env);
  const r = rodar(dir, "scripts/publicar.mjs", ["visibilidade", EP, "agendado", "2099-01-01T18:00"], env);
  assert.equal(r.status, 0, r.saida);
  const put = chamadas(dir).find((c) => c.metodo === "PUT" && c.url.endsWith("/youtube/v3/videos"));
  assert.equal(put.corpo.status.privacyStatus, "private");
  assert.equal(put.corpo.status.publishAt, "2099-01-01T21:00:00.000Z");
  assert.equal(ler(dir, "publicacoes.json").itens[0].status, "agendado");
});

const thread = (id, texto, autor = "UC" + id) => ({
  id,
  snippet: { canReply: true, topLevelComment: { snippet: { authorDisplayName: `Pessoa ${id}`, authorChannelId: { value: autor }, textOriginal: texto, publishedAt: new Date().toISOString(), likeCount: 0 } } },
});
const cenarioComentarios = { threads: [thread("T1", "Top demais!"), thread("T2", "Onde eu invisto 5 mil?"), thread("T3", "veja https://golpe.com")] };

function comVideoPublicado(dir) {
  mkdirSync(path.join(dir, "data"), { recursive: true });
  writeFileSync(path.join(dir, "data", "publicacoes.json"), JSON.stringify({ itens: [{ plataforma: "youtube", episodio: EP, status: "publico", videoId: "VID123", titulo: "T" }] }));
}

test("comentários: lê, classifica e NÃO responde sem a chave de respostas", () => {
  const dir = ambiente({ cenario: cenarioComentarios });
  comVideoPublicado(dir);
  const r = rodar(dir, "scripts/comentarios.mjs", ["ler"], { ...CRED });
  assert.equal(r.status, 0, r.saida);
  const itens = ler(dir, "comentarios.json").itens;
  assert.deepEqual(itens.map((c) => [c.id, c.categoria, c.status]), [["T1", "simples", "pendente"], ["T2", "financeira", "pendente"], ["T3", "spam", "ignorar_sugerido"]]);
  assert.equal(chamadas(dir).filter((c) => c.url.endsWith("/comments")).length, 0);
  assert.equal(ler(dir, "estatisticas.json").videos.VID123.views, 10);
});

test("comentários: automática ligada responde só o simples; financeira espera você", () => {
  const dir = ambiente({ cenario: cenarioComentarios, config: (c) => ((c.comentarios.respostaAutomatica.habilitada = true), c) });
  comVideoPublicado(dir);
  const env = { ...CRED, YOUTUBE_RESPOSTAS: "ligadas", YOUTUBE_RESPOSTA_AUTOMATICA: "ligada" };
  rodar(dir, "scripts/comentarios.mjs", ["ler"], env);
  const respostas = chamadas(dir).filter((c) => c.url.endsWith("/comments"));
  assert.deepEqual(respostas.map((c) => c.corpo.snippet.parentId), ["T1"]);
  const itens = ler(dir, "comentarios.json").itens;
  assert.equal(itens.find((c) => c.id === "T2").status, "pendente");

  // Aprovação manual da financeira, com texto seu.
  const r = rodar(dir, "scripts/comentarios.mjs", ["aprovar", "T2", "--texto", "Depende do seu objetivo. Vou fazer um vídeo!"], env);
  assert.equal(r.status, 0, r.saida);
  const enviada = chamadas(dir).filter((c) => c.url.endsWith("/comments")).at(-1);
  assert.equal(enviada.corpo.snippet.parentId, "T2");
  assert.equal(enviada.corpo.snippet.textOriginal, "Depende do seu objetivo. Vou fazer um vídeo!");
  assert.equal(ler(dir, "comentarios.json").itens.find((c) => c.id === "T2").status, "respondido");
});

test("aprovada com envio desligado fica guardada, sem chamada", () => {
  const dir = ambiente({ cenario: cenarioComentarios });
  comVideoPublicado(dir);
  rodar(dir, "scripts/comentarios.mjs", ["ler"], CRED);
  writeFileSync(path.join(dir, "chamadas.jsonl"), "");
  const r = rodar(dir, "scripts/comentarios.mjs", ["aprovar", "T1"], CRED);
  assert.match(r.saida, /aguardando/);
  assert.equal(chamadas(dir).filter((c) => c.url.endsWith("/comments")).length, 0);
  assert.equal(ler(dir, "comentarios.json").itens.find((c) => c.id === "T1").status, "aprovado");
});

test("chaves: precisam do valor exato e das credenciais", () => {
  assert.equal(modos({ YOUTUBE_PUBLICACAO: "true", ...CRED }).publicacao, false);
  assert.equal(modos({ YOUTUBE_PUBLICACAO: "ligada" }).publicacao, false);
  assert.equal(modos({ YOUTUBE_PUBLICACAO: "ligada", ...CRED }).publicacao, true);
  assert.equal(modos({ YOUTUBE_RESPOSTA_AUTOMATICA: "ligada", ...CRED }, { comentarios: { respostaAutomatica: { habilitada: true } } }).automatica, false);
});

test("datas: sem fuso vale horário de Brasília; cota usa o dia do Pacífico", () => {
  assert.equal(quando("2026-11-05").toISOString(), "2026-11-05T03:00:00.000Z");
  assert.equal(quando("2026-11-05T10:00").toISOString(), "2026-11-05T13:00:00.000Z");
  assert.equal(diaPacifico(new Date("2026-11-05T06:00:00Z")), "2026-11-04");
});

test("IA gratuita sugere para perguntas; elogio simples usa texto pronto; nada é enviado", () => {
  const dir = ambiente({ cenario: cenarioComentarios });
  comVideoPublicado(dir);
  const r = rodar(dir, "scripts/comentarios.mjs", ["ler"], { ...CRED, GITHUB_TOKEN: "falso", GITHUB_REPOSITORY: "x/y" });
  assert.equal(r.status, 0, r.saida);
  const itens = ler(dir, "comentarios.json").itens;
  assert.equal(itens.find((c) => c.id === "T2").sugestaoOrigem, "ia");
  assert.match(itens.find((c) => c.id === "T2").sugestao, /Depende/);
  assert.equal(itens.find((c) => c.id === "T1").sugestaoOrigem, "modelo");
  assert.equal(itens.find((c) => c.id === "T3").sugestaoOrigem, "modelo", "spam não vai para a IA");
  assert.equal(chamadas(dir).filter((c) => c.url.endsWith("/comments")).length, 0);
});

test("envio com a confirmação ENVIAR-PRIVADO vale como autorização da execução", () => {
  assert.equal(modos({ ...CRED, CONFIRMACAO_ENVIO: "ENVIAR-PRIVADO" }).publicacao, true);
  assert.equal(modos({ ...CRED, CONFIRMACAO_ENVIO: "enviar" }).publicacao, false);
  assert.equal(modos({ CONFIRMACAO_ENVIO: "ENVIAR-PRIVADO" }).publicacao, false);
});
