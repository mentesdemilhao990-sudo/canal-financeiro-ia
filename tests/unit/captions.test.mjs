import { test } from "node:test";
import assert from "node:assert/strict";
import { groupWords, parseSrt, srtTime, toSrt } from "../../src/lib/captions.mjs";
import { estimateTimeline } from "../../src/lib/estimate.mjs";

const words = "Guardar não é investir. O dinheiro parado perde valor com a inflação todo ano."
  .split(" ")
  .map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.35 }));

test("formata tempo SRT", () => {
  assert.equal(srtTime(0), "00:00:00,000");
  assert.equal(srtTime(61.234), "00:01:01,234");
  assert.equal(srtTime(3600.5), "01:00:00,500");
});

test("agrupa palavras sem passar dos limites e quebra no ponto final", () => {
  const cues = groupWords(words, { maxWords: 4, maxChars: 24 });
  for (const c of cues) {
    assert.ok(c.words.length <= 4);
    assert.ok(c.text.length <= 24 || c.words.length === 1);
  }
  assert.equal(cues[0].text, "Guardar não é investir.");
  assert.equal(cues.flatMap((c) => c.words).length, words.length, "nenhuma palavra perdida");
});

test("SRT gerado é válido e em ordem", () => {
  const srt = parseSrt(toSrt(groupWords(words)));
  srt.forEach((c, i) => {
    assert.equal(c.index, i + 1);
    assert.ok(c.end > c.start);
    if (i) assert.ok(c.start >= srt[i - 1].end - 1e-6, "legendas não se sobrepõem");
  });
});

test("linha do tempo estimada cobre todas as cenas em ordem", () => {
  const tl = estimateTimeline({ scenes: [{ id: "a", narration: "uma frase curta." }, { id: "b", narration: "outra frase." }] });
  assert.equal(tl.scenes.length, 2);
  assert.ok(tl.scenes[1].start >= tl.scenes[0].start);
  assert.ok(tl.duration > tl.scenes[1].words.at(-1).end);
});

test("toSrt: palavras com tempo zero ou fora de ordem não geram legenda inválida", () => {
  const cues = [
    { start: 1, end: 2, text: "um" },
    { start: 2.5, end: 2.5, text: "dois" }, // duração zero
    { start: 2.4, end: 3, text: "três" }, // começa antes da anterior
    { start: 3, end: 2.9, text: "quatro" }, // fim antes do início
  ];
  const out = parseSrt(toSrt(cues));
  out.forEach((c, i) => {
    assert.ok(c.end > c.start, `legenda ${i + 1} com tempo inválido`);
    if (i) assert.ok(c.start >= out[i - 1].end - 0.001, `legenda ${i + 1} sobrepõe a anterior`);
  });
});
