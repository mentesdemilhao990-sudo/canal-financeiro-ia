import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEpisode } from "../../src/lib/schema.mjs";
import { paraHashtag, problemasMetadata, tamanhoTags, termosDoNicho, youtubeMetadata } from "../../scripts/lib/metadata.mjs";

const cfg = JSON.parse(readFileSync("config/publicacao.json", "utf8")).youtube;
const ep = () => parseEpisode(JSON.parse(readFileSync("episodes/guardar-nao-e-investir.json", "utf8")));

test("metadados do episódio de exemplo passam nos limites do YouTube", () => {
  const m = youtubeMetadata(ep(), cfg, { duration: 42 });
  assert.deepEqual(problemasMetadata(m), []);
  assert.equal(m.title, ep().title);
  assert.ok(m.hashtags.includes("shorts"), "vídeo curto vertical recebe #shorts");
  assert.match(m.description, /não é recomendação/);
  assert.match(m.description, /#educacaofinanceira/);
  assert.ok(m.tags.includes("inflação"));
});

test("hashtag sem acento, minúscula e sem espaço", () => {
  assert.equal(paraHashtag("Juros Compostos!"), "juroscompostos");
  assert.equal(paraHashtag("#Educação"), "educacao");
});

test("termos do nicho são achados na narração", () => {
  assert.deepEqual(termosDoNicho("Monte sua reserva de emergência no Tesouro Selic"), ["reserva de emergência", "tesouro selic", "selic"]);
});

test("título longo é cortado em 100 e tags somam até 500", () => {
  const e = ep();
  e.title = "Palavra ".repeat(30).trim();
  e.tags = Array.from({ length: 15 }, (_, i) => `tag bem comprida número ${i} sobre finanças`);
  const m = youtubeMetadata(e, cfg);
  assert.ok(m.title.length <= 100);
  assert.ok(tamanhoTags(m.tags) <= 500);
  assert.deepEqual(problemasMetadata(m), []);
});

test("remove < e > que o YouTube recusa", () => {
  const e = ep();
  e.title = "Guardar <> investir";
  assert.equal(youtubeMetadata(e, cfg).title, "Guardar investir");
});

test("título e hashtags do bloco publicacao.youtube têm prioridade", () => {
  const e = ep();
  e.publicacao = { youtube: { titulo: "Outro título", hashtags: ["#dinheiro"] } };
  const m = youtubeMetadata(e, cfg);
  assert.equal(m.title, "Outro título");
  assert.equal(m.hashtags[0], "dinheiro");
});

test("schema aceita a agenda e recusa data inválida", () => {
  const raw = JSON.parse(readFileSync("episodes/guardar-nao-e-investir.json", "utf8"));
  raw.publicacao = { youtube: { enviarEm: "2026-11-05T10:00" } };
  assert.equal(parseEpisode(raw).publicacao.youtube.enviarEm, "2026-11-05T10:00");
  raw.publicacao.youtube.enviarEm = "amanhã";
  assert.throws(() => parseEpisode(raw), /publicacao\.youtube\.enviarEm/);
});
