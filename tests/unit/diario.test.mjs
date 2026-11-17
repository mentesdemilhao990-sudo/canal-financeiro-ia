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
import { consertarParte, escreverEpisodio, estimarDuracao, montarEpisodio, problemasDeConteudo } from "../../scripts/lib/roteirista.mjs";
import { problemasMetadata, youtubeMetadata } from "../../scripts/lib/metadata.mjs";
import { modos } from "../../scripts/lib/modos.mjs";

process.env.GEMINI_ESPERA_429_MS = "0";
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
  assert.throws(() => parseEpisode({ ...short(), targetDurationSeconds: 200 }), /Short a duração vai de 30 a 175/);
  assert.throws(() => parseEpisode({ ...longo(), targetDurationSeconds: 50 }), /longo a duração vai de 90 a 900/);
  assert.throws(() => parseEpisode({ ...longo(), scenes: longo().scenes.slice(0, 4) }), /de 6 a 44 cenas/);
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
  // O Short diário passa de 1 min 31 s: o exemplo ganha cenas de meio para chegar ao tamanho.
  const extras = [
    { id: "exemplo", template: "counter", narration: "Pense na Ana, que deixou cinco mil reais esquecidos na conta corrente por três anos. O saldo continuou igual, mas o mercado ficou mais caro e o dinheiro dela passou a comprar bem menos.", data: { label: "Poder de compra de R$ 5.000", from: 5000, to: 4380, prefix: "R$ ", trend: "down" } },
    { id: "reserva", template: "list", narration: "Isso não quer dizer que guardar seja errado. A reserva de emergência existe para imprevistos, como uma conta de saúde ou um conserto do carro, e precisa estar num lugar seguro e fácil de tirar.", data: { title: "Para que serve guardar", items: ["Imprevistos", "Segurança", "Acesso rápido"] } },
    { id: "tamanho", template: "bars", narration: "Uma boa regra é juntar de três a seis meses dos seus gastos. Quem gasta dois mil reais por mês mira algo entre seis mil e doze mil reais de reserva antes de pensar em outros passos.", data: { title: "Reserva ideal", valuePrefix: "R$ ", items: [{ label: "3 meses", value: 6000, color: "gold" }, { label: "6 meses", value: 12000, color: "green" }] } },
    { id: "depois", template: "split", narration: "Depois da reserva pronta, o que sobra pode ir para investimentos de prazo maior. Assim um dinheiro protege você no presente e o outro trabalha com calma pelo seu futuro.", data: { left: { label: "Reserva", icon: "safe", points: ["Curto prazo"] }, right: { label: "Investimento", icon: "growth", points: ["Longo prazo"] } } },
    { id: "erro", template: "list", narration: "O erro mais comum é misturar tudo na mesma conta. Separar os objetivos deixa claro quanto está protegido, quanto está crescendo e evita gastar sem perceber o que era para o futuro.", data: { title: "Separe os objetivos", items: ["Conta da reserva", "Conta dos investimentos"] } },
  ];
  const scenes = [...e.scenes.slice(0, -1), ...extras, e.scenes.at(-1)];
  return { title: "Guardar dinheiro parado faz você perder?", description: e.description, tags: e.tags, scenes };
}

test("roteiro: montar, validar duração e regras de conteúdo", () => {
  const ep = montarEpisodio(respostaShort(), { id: "2026-11-01-inflacao-short", formato: "short" });
  assert.equal(ep.formato, "short");
  assert.match(ep.disclaimer, /não é recomendação/);
  assert.ok(ep.targetDurationSeconds > 91 && ep.targetDurationSeconds < 180, `${ep.targetDurationSeconds} s`);
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

test("roteiro: duração estimada segue a voz calma do Gemini (Short de 858 caracteres saiu com 71 s)", () => {
  const d = estimarDuracao(short().scenes);
  assert.ok(d > 52 && d < 60, `estimativa ${d.toFixed(1)} s`);
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
    assert.equal(b.format.properties.scenes.minItems, 8, "resposta presa ao formato do Short");
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

test("roteiro: abertura com saudação é recusada", () => {
  const ep = montarEpisodio(respostaShort(), { id: "2026-11-01-x-short", formato: "short" });
  ep.scenes[0] = { ...ep.scenes[0], narration: "Bom dia! Hoje vamos falar sobre o décimo terceiro salário e onde colocar esse dinheiro." };
  assert.match(problemasDeConteudo(ep, "short").join(), /não abra com saudação/);
});

test("roteiro: com GEMINI_API_KEY o Gemini escreve primeiro e o limite passa para a reserva", async () => {
  const { modelosPadrao } = await import("../../scripts/lib/roteirista.mjs");
  assert.deepEqual(modelosPadrao({ GEMINI_API_KEY: "k", OLLAMA_MODELO: "qwen2.5:7b" }), ["gemini:gemini-3.8-flash", "gemini:gemini-flash-latest", "ollama:qwen2.5:7b"]);
  assert.deepEqual(modelosPadrao({ OLLAMA_MODELO: "qwen2.5:7b" }), ["ollama:qwen2.5:7b"]);
  const antes = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "chave-teste";
  try {
    const urls = [];
    const f = async (url, init) => {
      urls.push(String(url));
      if (/generativelanguage/.test(String(url))) {
        assert.equal(init.headers.authorization, "Bearer chave-teste");
        assert.equal(JSON.parse(init.body).model, "gemini-2.5-flash");
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(respostaShort()) } }] }), { status: 200 });
      }
      throw new Error("não devia chamar outro modelo");
    };
    const r = await escreverEpisodio({ tema: temas.temas[0], formato: "short", id: "g-short" }, { token: "", modelos: ["gemini:gemini-2.5-flash", "ollama:qwen2.5:7b"], fetch: f, log: () => {} });
    assert.equal(r.modelo, "gemini:gemini-2.5-flash");
    const f429 = async (url) =>
      /generativelanguage/.test(String(url))
        ? new Response(JSON.stringify([{ error: { message: "quota" } }]), { status: 429 })
        : new Response(JSON.stringify({ message: { content: JSON.stringify(respostaShort()) } }), { status: 200 });
    const r2 = await escreverEpisodio({ tema: temas.temas[0], formato: "short", id: "g2-short" }, { token: "", modelos: ["gemini:gemini-2.5-flash", "ollama:qwen2.5:7b"], fetch: f429, log: () => {} });
    assert.equal(r2.modelo, "ollama:qwen2.5:7b");
    // Modelo aposentado (404) passa direto para o próximo, sem repetir 3 vezes.
    let chamadas404 = 0;
    const f404 = async (url, init) => {
      if (/generativelanguage/.test(String(url))) {
        if (JSON.parse(init.body).model === "velho") {
          chamadas404++;
          return new Response(JSON.stringify([{ error: { message: "no longer available" } }]), { status: 404 });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(respostaShort()) } }] }), { status: 200 });
      }
      throw new Error("não devia chamar a IA local");
    };
    const r3 = await escreverEpisodio({ tema: temas.temas[0], formato: "short", id: "g3-short" }, { token: "", modelos: ["gemini:velho", "gemini:novo", "ollama:qwen2.5:7b"], fetch: f404, log: () => {} });
    assert.equal(r3.modelo, "gemini:novo");
    assert.equal(chamadas404, 1);
  } finally {
    if (antes === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = antes;
  }
});

// Parte fictícia do vídeo longo: 8 cenas de ~400 caracteres, falas únicas, sem algarismos.
const PALAVRAS = ["mercado", "salario", "boleto", "reserva", "juros", "feira", "aluguel", "cartao", "poupanca", "mesada", "viagem", "carro", "padaria", "conta", "luz", "gasolina"];
function parteLonga(i, n) {
  const fala = (k) => {
    const w = (j) => PALAVRAS[(i * 8 + k + j * 3) % PALAVRAS.length];
    return `Agora repara numa coisa, parte ${["um", "dois", "tres"][i]} cena ${["a", "b", "c", "d", "e", "f", "g", "h"][k]}: o ${w(0)} pesa no orcamento, e o ${w(1)} tambem, sabe por que? Pensa comigo, quando o ${w(2)} sobe, o ${w(3)} acompanha. Pra quem ganha pouco, cada real conta, ne? Entao a ideia aqui e simples: anotar, comparar e decidir com calma antes de gastar com ${w(4)} ou ${w(5)}. Parece bobo, mas faz diferenca no fim do mes.`;
  };
  const scenes = Array.from({ length: 8 }, (_, k) => ({ id: `p${i}-c${k}`, template: "list", narration: fala(k), data: { title: `Ponto ${i + 1}.${k + 1}`, items: ["Anotar", "Comparar"] } }));
  if (i === 0) scenes[0] = { ...scenes[0], template: "hook", data: { title: "Dólar alto" } };
  if (i === n - 1) scenes[7] = { ...scenes[7], template: "outro", narration: `${scenes[7].narration} Se isso te ajudou, se inscreve ai que toda semana tem mais.`, data: { title: "Resumo do dia", points: [], cta: "Inscreva-se" } };
  return { title: "Por que o DÓLAR mexe no preço do seu mercado", description: "Aula sobre dólar e orçamento.", tags: ["dolar"], scenes };
}

test("roteiro longo: escrito em 3 partes que viram um vídeo de 8 minutos ou mais", async () => {
  const pedidos = [];
  const f = async (url, init) => {
    const corpo = JSON.parse(init.body);
    pedidos.push(corpo);
    const k = pedidos.length - 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(parteLonga(k, 3)) } }] }), { status: 200 });
  };
  const antes = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "k";
  try {
    const r = await escreverEpisodio({ tema: temas.temas[0], formato: "longo", id: "2026-11-05-dolar-longo" }, { token: "", modelos: ["gemini:x"], fetch: f, log: () => {} });
    assert.equal(pedidos.length, 3);
    assert.match(pedidos[0].messages[0].content, /PARTE 1 de 3/);
    assert.match(pedidos[2].messages[0].content, /PARTE 3 de 3/);
    assert.match(pedidos[1].messages[1].content, /já foi dito/);
    const ep = r.episodio;
    assert.equal(ep.scenes.length, 24);
    assert.equal(ep.scenes[0].template, "hook");
    assert.equal(ep.scenes.at(-1).template, "outro");
    assert.ok(ep.targetDurationSeconds >= 480, `duração estimada ${ep.targetDurationSeconds} s`);
    assert.equal(new Set(ep.scenes.map((s) => s.id)).size, 24);
  } finally {
    if (antes === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = antes;
  }
});

test("roteiro: pedido de inscrição só uma vez, no fechamento", () => {
  const ep = montarEpisodio(respostaShort(), { id: "x-short", formato: "short" });
  assert.deepEqual(problemasDeConteudo(ep, "short"), []);
  const meio = structuredClone(ep);
  meio.scenes[1].narration += " Inscreva-se no canal.";
  assert.match(problemasDeConteudo(meio, "short").join(), /cena 2: não peça inscrição/);
  const titulo = structuredClone(ep);
  titulo.scenes.at(-1).data.title = "Inscreva-se agora!";
  assert.match(problemasDeConteudo(titulo, "short").join(), /não escreva "inscreva-se"/);
});

test("roteiro longo: partes curtas ganham uma parte extra de meio para chegar aos 8 minutos", async () => {
  const pedidos = [];
  const f = async (url, init) => {
    pedidos.push(JSON.parse(init.body));
    const k = pedidos.length - 1;
    const p = parteLonga(k % 3, 3);
    // Só 6 cenas por parte (~2400 caracteres): três partes não chegam ao mínimo.
    p.scenes = p.scenes.slice(0, 5).concat(p.scenes.slice(-1));
    if (k < 3) p.scenes = p.scenes.filter((s) => s.template !== "outro");
    p.scenes = p.scenes.map((s) => ({ ...s, id: `${s.id}-${k}`, narration: s.narration.replace("cena", `trecho ${["um", "dois", "tres", "quatro", "cinco"][k]} cena`) }));
    if (k === pedidos.length - 1 && /PARTE 4 de 4|PARTE 5 de 5/.test(pedidos[k].messages[0].content) && /→ PARTE 3/.test(pedidos[k].messages[0].content))
      p.scenes.push({ id: `fim-${k}`, template: "outro", narration: "Comenta aí o que você faria. Se isso te ajudou, se inscreve aí que toda semana tem mais.", data: { title: "Resumo", points: [], cta: "Inscreva-se" } });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(p) } }] }), { status: 200 });
  };
  const r = await escreverEpisodio({ tema: temas.temas[0], formato: "longo", id: "x-longo" }, { token: "", modelos: ["gemini:x"], fetch: f, log: () => {} });
  assert.ok(pedidos.length >= 4, `${pedidos.length} partes`);
  assert.match(pedidos[2].messages[0].content, /parte extra do MEIO/);
  assert.ok(r.episodio.targetDurationSeconds >= 480);
  assert.equal(r.episodio.scenes.filter((s) => s.template === "outro").length, 1);
  assert.equal(r.episodio.scenes.filter((s) => s.template === "hook").length, 1);
});

test("roteiro: conserta sozinho hook, outro e inscrição fora do lugar nas partes", () => {
  const p = parteLonga(1, 3);
  p.scenes[0] = { ...p.scenes[0], template: "hook", data: { title: "Olha isso", subtitle: "o meio do vídeo" } };
  p.scenes[3].narration += " Inscreva-se no canal.";
  p.scenes.push({ id: "fim", template: "outro", narration: "Se inscreve no canal e ativa o sininho pra não perder nada.", data: { title: "Inscreva-se!", points: ["Inscreva-se"], cta: "Inscreva-se" } });
  const ep = consertarParte({ ...p }, { i: 1, n: 3, papel: 1 });
  assert.equal(ep.scenes[0].template, "list");
  assert.ok(!ep.scenes.some((s) => s.template === "outro" || /inscrev/i.test(s.narration)));
  assert.deepEqual(problemasDeConteudo(ep, "longo", { parte: { i: 1, n: 3, papel: 1 } }).filter((x) => /hook|outro|inscri/.test(x)), []);
});

test("roteiro longo: parte com 5 cenas vale, e JSON cortado recomeça a conversa do zero", async () => {
  const pedidos = [];
  const f = async (url, init) => {
    const corpo = JSON.parse(init.body);
    pedidos.push(corpo);
    const k = pedidos.length - 1;
    if (k === 1) return new Response(JSON.stringify({ choices: [{ message: { content: '{"title": "cortado", "scenes": [{"narration": "sem fim' } }] }), { status: 200 });
    const p = parteLonga(Math.min(k === 0 ? 0 : k - 1, 2), 3);
    if (k > 0 && k < 3) p.scenes = p.scenes.slice(0, 5);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(p) } }] }), { status: 200 });
  };
  const r = await escreverEpisodio({ tema: temas.temas[0], formato: "longo", id: "c-longo" }, { token: "", modelos: ["gemini:y"], fetch: f, log: () => {} });
  assert.equal(pedidos[2].messages.length, 2, "depois do JSON cortado, pede de novo sem a resposta quebrada");
  assert.ok(r.episodio.scenes.length >= 15);
});

test("roteiro: gráfico de linhas com valores faltando ou sobrando é ajustado aos rótulos", () => {
  const ep = {
    title: "t",
    scenes: [
      { id: "a", template: "lineChart", narration: "Olha esse gráfico aqui.", data: { title: "G", xLabels: ["1", "2", "3", "4"], series: [{ label: "A", color: "green", values: [1, 2] }, { label: "B", color: "gold", values: [1, 2, 3, 4, 5, 6] }] } },
    ],
  };
  const r = consertarParte(ep);
  assert.deepEqual(r.scenes[0].data.series.map((x) => x.values), [[1, 2, 2, 2], [1, 2, 3, 4]]);
});

test("roteiro: Short comprido é encurtado e o convite final aparece uma vez só", () => {
  const ep = montarEpisodio(respostaShort(), { id: "y-short", formato: "short" });
  ep.scenes[2].narration += " Mais uma frase longa só pra encher o roteiro e passar do tamanho certo do Short. E outra frase comprida que também não precisava estar aqui de jeito nenhum.";
  ep.scenes[3].narration += " Aqui vai mais um trecho bem comprido para deixar o Short grande demais para caber em um minuto.";
  for (const k of [4, 5, 6, 7]) ep.scenes[k].narration += " Mais uma frase comprida para passar do tamanho certo do Short. E ainda outra frase longa que também não precisava estar aqui.";
  ep.scenes.at(-1).narration = "Se inscreve no canal. E se inscreve mesmo, viu? Comenta aí o que achou.";
  consertarParte(ep);
  const chars = ep.scenes.reduce((t, s) => t + s.narration.length, 0);
  assert.ok(chars <= 1705, `${chars} caracteres`);
  assert.equal((ep.scenes.at(-1).narration.match(/inscrev/gi) ?? []).length, 1);
  assert.match(ep.scenes[0].narration, /^Guardar dinheiro/);
});

test("roteiro: texto da tela maior que o limite é cortado em vez de recusar (Gemini em 13/11)", async () => {
  const { cortarTextosLongos } = await import("../../scripts/lib/roteirista.mjs");
  const ep = montarEpisodio(respostaShort(), { id: "2026-11-13-x-short", formato: "short" });
  const i = ep.scenes.findIndex((s) => s.template === "hook");
  ep.scenes[i].data.title = "Um título de abertura bem comprido que passa muito do limite permitido";
  cortarTextosLongos(ep);
  assert.ok(ep.scenes[i].data.title.length <= 60);
  assert.doesNotThrow(() => parseEpisode(ep));
});

test("roteiro longo: parte final sem \"outro\" (fala repetida) ganha o fechamento padrão", async () => {
  // A IA local devolve a parte final com o "outro" repetindo uma fala da parte anterior: a cena sai,
  // e antes o roteiro era recusado 3 vezes ("a última cena precisa ser outro").
  const respostas = [parteLonga(0, 3), parteLonga(1, 3)];
  const final = parteLonga(2, 3);
  final.scenes[7] = { ...final.scenes[7], narration: respostas[1].scenes[3].narration };
  respostas.push(final);
  let k = 0;
  const f = async () => new Response(JSON.stringify({ message: { content: JSON.stringify(respostas[Math.min(k++, 2)]) } }), { status: 200 });
  const r = await escreverEpisodio({ tema: temas.temas[0], formato: "longo", id: "2026-11-13-x-longo" }, { token: "", modelos: ["ollama:qwen2.5:7b"], fetch: f, log: () => {} });
  assert.equal(r.episodio.scenes.at(-1).template, "outro");
  assert.equal(k, 3, "cada parte saiu na primeira tentativa");
});

test("roteiro: Gemini sem resposta (fetch failed) passa logo para a reserva", async () => {
  const antes = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "chave-teste";
  try {
    let gemini = 0;
    const f = async (url) => {
      if (/generativelanguage/.test(String(url))) {
        gemini++;
        throw new TypeError("fetch failed");
      }
      return new Response(JSON.stringify({ message: { content: JSON.stringify(respostaShort()) } }), { status: 200 });
    };
    const r = await escreverEpisodio({ tema: temas.temas[0], formato: "short", id: "g4-short" }, { token: "", modelos: ["gemini:a", "ollama:qwen2.5:7b"], fetch: f, log: () => {} });
    assert.equal(r.modelo, "ollama:qwen2.5:7b");
    assert.equal(gemini, 1);
  } finally {
    if (antes === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = antes;
  }
});

test("roteiro: Short com 6 ou 7 cenas e tamanho certo é aceito (a IA local erra a contagem)", () => {
  const ep = montarEpisodio(respostaShort(), { id: "2026-11-13-y-short", formato: "short" });
  const meio = ep.scenes.slice(1, -1);
  const juntas = [ep.scenes[0], ...meio.slice(0, 4), { ...meio[4], narration: meio.slice(4).map((s) => s.narration).join(" ").slice(0, 370) }, ep.scenes.at(-1)];
  const p = problemasDeConteudo({ ...ep, scenes: juntas }, "short");
  assert.ok(!p.some((x) => /cenas \(vieram/.test(x)), p.join("; "));
});
