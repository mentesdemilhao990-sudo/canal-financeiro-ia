// Pauta diária: vídeo longo, temas em alta, roteiros da IA e publicação pública.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dimensoes, parseEpisode } from "../../src/lib/schema.mjs";
import { capitulos } from "../../src/lib/capitulos.mjs";
import { escolher, lerRss, menciona, pontuar } from "../../scripts/lib/tendencias.mjs";
import { escreverEpisodio, estimarDuracao, montarEpisodio, problemasDeConteudo } from "../../scripts/lib/roteirista.mjs";
import { problemasMetadata, youtubeMetadata } from "../../scripts/lib/metadata.mjs";
import { modos } from "../../scripts/lib/modos.mjs";

const longo = () => JSON.parse(readFileSync("tests/fixtures/exemplo-longo.json", "utf8"));
const short = () => JSON.parse(readFileSync("episodes/guardar-nao-e-investir.json", "utf8"));
const temas = JSON.parse(readFileSync("config/temas.json", "utf8"));
const cfgYt = JSON.parse(readFileSync("config/publicacao.json", "utf8")).youtube;

test("formatos: Short vertical por padrão, longo horizontal", () => {
  assert.equal(parseEpisode(short()).formato, "short");
  assert.deepEqual([dimensoes(parseEpisode(short())).width, dimensoes(parseEpisode(short())).height], [1080, 1920]);
  const l = parseEpisode(longo());
  assert.deepEqual([dimensoes(l).width, dimensoes(l).height], [1920, 1080]);
});

test("formatos: limites de duração e cenas valem para cada um", () => {
  assert.throws(() => parseEpisode({ ...short(), targetDurationSeconds: 120 }), /Short a duração vai de 30 a 60/);
  assert.throws(() => parseEpisode({ ...longo(), targetDurationSeconds: 50 }), /longo a duração vai de 90 a 480/);
  assert.throws(() => parseEpisode({ ...longo(), scenes: longo().scenes.slice(0, 4) }), /de 6 a 20 cenas/);
  const s = short();
  s.scenes[0].narration = "a ".repeat(250);
  assert.throws(() => parseEpisode(s), /mais de 400 caracteres/);
});

test("capítulos do vídeo longo começam em 0:00 e juntam cenas curtas", () => {
  const ep = parseEpisode(longo());
  const tempos = ep.scenes.map((_, i) => ({ start: i * 15, end: i * 15 + 15 }));
  tempos[2] = { start: 30, end: 35 }; // cena curta
  tempos[3] = { start: 35, end: 60 };
  const caps = capitulos(ep, tempos);
  assert.equal(caps[0].tempo, "0:00");
  assert.ok(caps.length >= 3);
  for (let i = 1; i < caps.length; i++) assert.ok(caps[i].start - caps[i - 1].start >= 10);
  assert.ok(!caps.some((c) => c.start === 35), "cena com menos de 10 s não vira capítulo");
});

test("metadados: longo sem #shorts e com capítulos; Short continua com #shorts", () => {
  const ep = parseEpisode(longo());
  const caps = capitulos(ep, ep.scenes.map((_, i) => ({ start: i * 20, end: i * 20 + 20 })));
  const m = youtubeMetadata(ep, cfgYt, { duration: 180, capitulos: caps });
  assert.ok(!m.hashtags.includes("shorts"));
  assert.match(m.description, /Capítulos:\n0:00 Juros sobre juros\n0:20 /);
  assert.deepEqual(problemasMetadata(m), []);
  assert.ok(youtubeMetadata(parseEpisode(short()), cfgYt, { duration: 42 }).hashtags.includes("shorts"));
});

const RSS_TRENDS = `<?xml version="1.0"?><rss><channel>
<item><title>black friday 2026</title><ht:approx_traffic>200,000+</ht:approx_traffic><pubDate>Sat, 31 Oct 2026 10:00:00 -0300</pubDate>
<ht:news_item><ht:news_item_title><![CDATA[Procon dá dicas para não cair em golpe na Black Friday]]></ht:news_item_title></ht:news_item></item>
<item><title>flamengo x palmeiras</title><ht:approx_traffic>500,000+</ht:approx_traffic></item>
</channel></rss>`;

test("RSS: lê títulos, tráfego e manchetes do Google Trends", () => {
  const itens = lerRss(RSS_TRENDS);
  assert.equal(itens.length, 2);
  assert.equal(itens[0].titulo, "black friday 2026");
  assert.equal(itens[0].trafego, 200000);
  assert.deepEqual(itens[0].manchetes, ["Procon dá dicas para não cair em golpe na Black Friday"]);
});

test("menciona: palavra inteira e sem acento", () => {
  assert.ok(menciona("Copom mantém a SELIC", ["selic"]));
  assert.ok(menciona("Inflação acelera", ["inflacao"]));
  assert.ok(!menciona("Betinho ganhou", ["bet"]));
});

test("pontuação: tema em alta ganha e tema usado há pouco fica de fora", () => {
  const fontes = { trends: lerRss(RSS_TRENDS), noticias: [{ titulo: "Endividamento das famílias bate recorde" }, { titulo: "Serasa: inadimplência sobe" }] };
  const hoje = new Date("2026-11-01T12:00:00-03:00");
  let r = pontuar(temas.temas, fontes, { hoje });
  assert.equal(escolher(r).tema.id, "black-friday");
  r = pontuar(temas.temas, fontes, { hoje, usados: [{ tema: "black-friday", data: "2026-10-25" }], diasSemRepetir: 30 });
  assert.ok(r.find((x) => x.tema.id === "black-friday").bloqueado);
  assert.notEqual(escolher(r).tema.id, "black-friday");
  // "golpe" aparece na manchete da busca em alta, então golpes passa à frente das dívidas.
  assert.equal(escolher(r).tema.id, "pix-golpes");
});

test("pontuação sem internet: ainda escolhe um tema (época do ano e menos usado)", () => {
  const r = pontuar(temas.temas, { trends: [], noticias: [] }, { hoje: new Date("2026-11-01T12:00:00-03:00") });
  assert.ok(["decimo-terceiro", "black-friday"].includes(escolher(r).tema.id));
});

/** Resposta de IA válida para o Short, construída a partir do episódio de exemplo. */
function respostaShort() {
  const e = short();
  e.scenes[2].narration += " Por isso vale entender bem essa diferença antes de decidir.";
  return { title: "Guardar dinheiro parado faz você perder?", description: e.description, tags: e.tags, scenes: e.scenes };
}

test("roteiro: montar, validar duração e regras de conteúdo", () => {
  const ep = montarEpisodio(respostaShort(), { id: "2026-11-01-inflacao-short", formato: "short" });
  assert.equal(ep.formato, "short");
  assert.match(ep.disclaimer, /não é recomendação/);
  assert.ok(ep.targetDurationSeconds >= 30 && ep.targetDurationSeconds <= 60);
  parseEpisode(ep);
  assert.deepEqual(problemasDeConteudo(ep, "short"), []);
  const ruim = structuredClone(ep);
  ruim.scenes[1].narration = "Abra uma conta no Nubank e tenha 10% de lucro garantido.";
  const p = problemasDeConteudo(ruim, "short").join(" | ");
  assert.match(p, /nubank/);
  assert.match(p, /prometa/);
  assert.match(p, /por extenso/);
  assert.match(p, /por cento/);
  assert.match(problemasDeConteudo(ep, "short", { titulosUsados: ["guardar dinheiro parado faz voce perder?"] }).join(), /já foi usado/);
});

test("roteiro: duração estimada bate com a voz real do episódio de exemplo (39 s)", () => {
  const d = estimarDuracao(short().scenes);
  assert.ok(Math.abs(d - 39.2) < 3, `estimativa ${d.toFixed(1)} s`);
});

test("roteiro: IA errou na primeira, recebe os problemas e corrige", async () => {
  const pedidos = [];
  const respostas = [{ title: "x", scenes: [] }, respostaShort()];
  const f = async (url, init) => {
    pedidos.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(respostas.shift()) } }] }), { status: 200 });
  };
  const r = await escreverEpisodio(
    { tema: temas.temas[0], formato: "short", id: "2026-11-01-reserva-de-emergencia-short", manchetes: ["Manchete de teste"] },
    { token: "t", fetch: f, log: () => {} },
  );
  assert.equal(r.tentativas, 2);
  assert.equal(r.episodio.id, "2026-11-01-reserva-de-emergencia-short");
  assert.equal(pedidos[0].response_format.type, "json_object");
  assert.match(pedidos[0].messages[1].content, /Manchete de teste/);
  assert.match(pedidos[1].messages.at(-1).content, /Corrija/);
  assert.equal(pedidos[1].messages.length, 4, "na correção vai só a última resposta");
});

test("roteiro: limite gratuito (429) passa para o próximo modelo", async () => {
  const modelos = [];
  const f = async (url, init) => {
    const b = JSON.parse(init.body);
    modelos.push(b.model);
    if (b.model === "openai/gpt-4.1") return new Response("{}", { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(respostaShort()) } }] }), { status: 200 });
  };
  const r = await escreverEpisodio({ tema: temas.temas[0], formato: "short", id: "a-short" }, { token: "t", fetch: f, log: () => {} });
  assert.deepEqual(modelos, ["openai/gpt-4.1", "openai/gpt-4o-mini"]);
  assert.equal(r.modelo, "openai/gpt-4o-mini");
});

test("chaves: só a pauta diária libera envio direto como público", () => {
  const CRED = { YOUTUBE_CLIENT_ID: "id", YOUTUBE_CLIENT_SECRET: "s", YOUTUBE_REFRESH_TOKEN: "t" };
  assert.equal(modos({ ...CRED, CONFIRMACAO_ENVIO: "PUBLICACAO-DIARIA" }).publicoDireto, true);
  assert.equal(modos({ ...CRED, CONFIRMACAO_ENVIO: "PUBLICACAO-DIARIA" }).publicacao, true);
  assert.equal(modos({ ...CRED, CONFIRMACAO_ENVIO: "ENVIAR-PRIVADO" }).publicoDireto, false);
  assert.equal(modos({ ...CRED, YOUTUBE_PUBLICACAO: "ligada" }).publicoDireto, false);
  assert.equal(modos({ CONFIRMACAO_ENVIO: "PUBLICACAO-DIARIA" }).publicoDireto, false);
});

function ambientePublicar(ids) {
  const dir = mkdtempSync(path.join(tmpdir(), "diario-"));
  for (const id of ids) {
    mkdirSync(path.join(dir, "out", id), { recursive: true });
    writeFileSync(path.join(dir, "out", id, `${id}.mp4`), Buffer.alloc(2048, id.length));
    writeFileSync(path.join(dir, "out", id, `${id}-info.json`), JSON.stringify({ duration: 42, engine: "piper:pt_BR-faber-medium" }));
  }
  writeFileSync(path.join(dir, "cenario.json"), "{}");
  writeFileSync(path.join(dir, "chamadas.jsonl"), "");
  const cfg = JSON.parse(readFileSync("config/publicacao.json", "utf8"));
  cfg.youtube.canalEsperado = "Canal Teste";
  writeFileSync(path.join(dir, "publicacao.json"), JSON.stringify(cfg));
  return dir;
}

const rodarPublicar = (dir, args, env) =>
  spawnSync("node", ["--import", "./tests/helpers/youtube-falso.mjs", "scripts/publicar.mjs", ...args, "--saida", path.join(dir, "out")], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      DATA_DIR: path.join(dir, "data"),
      CHAMADAS_ARQ: path.join(dir, "chamadas.jsonl"),
      CENARIO_ARQ: path.join(dir, "cenario.json"),
      PUBLICACAO_CONFIG: path.join(dir, "publicacao.json"),
      YOUTUBE_CLIENT_ID: "id",
      YOUTUBE_CLIENT_SECRET: "s",
      YOUTUBE_REFRESH_TOKEN: "t",
      ...env,
    },
  });

test("publicação diária (YouTube falso): sobe público, avisa inscritos e registra como público", () => {
  const EP = "guardar-nao-e-investir";
  const dir = ambientePublicar([EP]);
  const r = rodarPublicar(dir, ["enviar", EP, "--visibilidade", "publico"], { CONFIRMACAO_ENVIO: "PUBLICACAO-DIARIA" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const ch = readFileSync(path.join(dir, "chamadas.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const ini = ch.find((c) => c.url.endsWith("/upload/youtube/v3/videos"));
  assert.equal(ini.corpo.status.privacyStatus, "public");
  assert.equal(ini.query.notifySubscribers, "true");
  // O YouTube falso devolve "private": o script tenta tornar público na hora.
  assert.ok(ch.some((c) => c.metodo === "PUT" && c.corpo?.status?.privacyStatus === "public"));
  const pub = JSON.parse(readFileSync(path.join(dir, "data", "publicacoes.json"), "utf8")).itens[0];
  assert.equal(pub.status, "publico");
  assert.equal(pub.privacidade, "public");
  // Rodar de novo não duplica.
  const r2 = rodarPublicar(dir, ["enviar", EP, "--visibilidade", "publico"], { CONFIRMACAO_ENVIO: "PUBLICACAO-DIARIA" });
  assert.match(r2.stdout + r2.stderr, /já foi enviado/);
});

test("publicação manual não pode pedir público direto", () => {
  const EP = "guardar-nao-e-investir";
  const dir = ambientePublicar([EP]);
  const r = rodarPublicar(dir, ["enviar", EP, "--visibilidade", "publico"], { CONFIRMACAO_ENVIO: "ENVIAR-PRIVADO" });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /só é permitido pela pauta diária/);
  assert.equal(readFileSync(path.join(dir, "chamadas.jsonl"), "utf8"), "");
});

test("roteiro: com OLLAMA_MODELO usa a IA local, sem token", async () => {
  const urls = [];
  const f = async (url, init) => {
    urls.push(String(url));
    const b = JSON.parse(init.body);
    assert.equal(b.model, "qwen2.5:7b");
    assert.equal(b.format.properties.scenes.minItems, 5, "resposta presa ao formato do Short");
    assert.equal(b.stream, true);
    return new Response(JSON.stringify({ message: { content: JSON.stringify(respostaShort()) } }), { status: 200 });
  };
  const r = await escreverEpisodio({ tema: temas.temas[0], formato: "short", id: "b-short" }, { token: "", modelos: ["ollama:qwen2.5:7b"], fetch: f, log: () => {} });
  assert.equal(r.modelo, "ollama:qwen2.5:7b");
  assert.match(urls[0], /:11434\/api\/chat$/);
});

test("narração: números e símbolos viram palavras", async () => {
  const { narracaoPorExtenso, inteiroPorExtenso } = await import("../../scripts/lib/por-extenso.mjs");
  assert.equal(inteiroPorExtenso(2026), "dois mil e vinte e seis");
  assert.equal(inteiroPorExtenso(16702), "dezesseis mil setecentos e dois");
  assert.equal(narracaoPorExtenso("R$ 10.000 a 4,5% ao ano"), "dez mil reais a quatro vírgula cinco por cento ao ano");
  assert.equal(narracaoPorExtenso("R$ 1 mil e R$ 2 milhões"), "mil reais e dois milhões de reais");
  assert.equal(narracaoPorExtenso("o 13º salário"), "o décimo terceiro salário");
  const ep = montarEpisodio({ title: "t", scenes: [{ id: "a", template: "hook", narration: "Guarde R$ 300 por mês.", data: {} }] }, { id: "x", formato: "short" });
  assert.equal(ep.scenes[0].narration, "Guarde trezentos reais por mês.");
});

test("roteiro: fechamento esquecido é colocado e alerta negado não conta como promessa", () => {
  const r = respostaShort();
  r.scenes = r.scenes.filter((s) => s.template !== "outro");
  const ep = montarEpisodio(r, { id: "2026-11-01-x-short", formato: "short" });
  assert.equal(ep.scenes.at(-1).template, "outro");
  assert.equal(ep.scenes.at(-1).data.cta, "Siga para mais");
  parseEpisode(ep);
  const alerta = structuredClone(ep);
  alerta.scenes[1].narration = "Lembre que não existe retorno garantido e nenhum investimento é sem risco.";
  assert.doesNotMatch(problemasDeConteudo(alerta, "short").join(), /prometa/);
  alerta.scenes[1].narration = "Aqui o retorno é garantido.";
  assert.match(problemasDeConteudo(alerta, "short").join(), /prometa/);
});

test("roteiro: nomes de campos, chaves e emojis saem da fala", async () => {
  const { limparNarracao } = await import("../../scripts/lib/roteirista.mjs");
  assert.equal(
    limparNarracao("Pagar tudo pode aliviar seu orçamento. Título: Dívidas / Prefixo: reais Legenda: x"),
    "Pagar tudo pode aliviar seu orçamento.",
  );
  assert.equal(limparNarracao("Qual escolha é melhor? 🤔💰\ndata: { , mil dívidas }"), "Qual escolha é melhor?");
  assert.equal(limparNarracao("Decida agora! Decida agora! Vamos lá"), "Decida agora! Vamos lá.");
});

test("roteiro: cena com fala repetida sai e o problema é apontado", () => {
  const r = respostaShort();
  const dup = { ...r, scenes: [...r.scenes.slice(0, -1), { ...r.scenes[1], id: "copia" }, r.scenes.at(-1)] };
  const ep = montarEpisodio(dup, { id: "2026-11-01-x-short", formato: "short" });
  assert.equal(ep.scenes.length, r.scenes.length);
  const bruto = { ...ep, scenes: [...ep.scenes.slice(0, 2), ep.scenes[1], ...ep.scenes.slice(2)] };
  assert.match(problemasDeConteudo(bruto, "short").join(), /repete a fala/);
  const lixo = { ...ep, scenes: ep.scenes.map((s, i) => (i === 1 ? { ...s, narration: s.narration + " Título: Metas" } : s)) };
  assert.match(problemasDeConteudo(lixo, "short").join(), /nomes de campos/);
});

test("horários sorteados: dentro da janela, com intervalo, mudam por dia e respeitam a hora atual", async () => {
  const { horariosAleatorios, horaBrasilia } = await import("../../scripts/lib/horarios.mjs");
  const ids = ["2026-11-02-x-longo", "2026-11-02-x-short"];
  const cedo = new Date("2026-11-02T09:00:00Z"); // 6h em Brasília
  const h = horariosAleatorios(ids, { dia: "2026-11-02", agora: cedo });
  const [a, b] = ids.map((i) => h[i]);
  for (const d of [a, b]) assert.ok(horaBrasilia(d) >= "10:00" && horaBrasilia(d) <= "21:00", horaBrasilia(d));
  assert.ok(b - a >= 120 * 60e3, "pelo menos 2 h entre os dois");
  assert.deepEqual(horariosAleatorios(ids, { dia: "2026-11-02", agora: cedo }), h, "mesmo dia, mesmo sorteio");
  const outros = new Set(["03", "04", "05", "06", "07"].map((d) => horaBrasilia(horariosAleatorios([`2026-11-${d}-x-longo`], { dia: `2026-11-${d}`, agora: new Date(`2026-11-${d}T09:00:00Z`) })[`2026-11-${d}-x-longo`])));
  assert.ok(outros.size >= 4, `horários variam: ${[...outros]}`);
  const tarde = horariosAleatorios(ids, { dia: "2026-11-02", agora: new Date("2026-11-02T21:30:00Z") }); // 18h30
  assert.ok(tarde[ids[0]] >= new Date("2026-11-02T21:50:00Z"), "nunca no passado");
  assert.ok(tarde[ids[1]] - tarde[ids[0]] >= 120 * 60e3);
  const noite = horariosAleatorios(ids, { dia: "2026-11-02", agora: new Date("2026-11-03T00:30:00Z") }); // 21h30
  assert.deepEqual(Object.values(noite), [null, null], "janela passou: publica na hora");
});

test("publicação diária com horário sorteado: sobe agendado e registra a hora", () => {
  const EP = "guardar-nao-e-investir";
  const dir = ambientePublicar([EP]);
  const r = rodarPublicar(dir, ["enviar", EP, "--visibilidade", "publico", "--horario", "aleatorio"], { CONFIRMACAO_ENVIO: "PUBLICACAO-DIARIA", AGORA_TESTE: "2000-01-01T09:00:00Z" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /agendado: fica \*\*público às \d\d:\d\d/);
  const ch = readFileSync(path.join(dir, "chamadas.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const ini = ch.find((c) => c.url.endsWith("/upload/youtube/v3/videos"));
  assert.equal(ini.corpo.status.privacyStatus, "private");
  assert.ok(ini.corpo.status.publishAt);
  const pub = JSON.parse(readFileSync(path.join(dir, "data", "publicacoes.json"), "utf8")).itens[0];
  assert.equal(pub.status, "agendado");
  assert.ok(pub.publicarEm);
});
