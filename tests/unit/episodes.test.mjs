import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { FORMATOS, parseEpisode } from "../../src/lib/schema.mjs";

const files = readdirSync("episodes").filter((f) => f.endsWith(".json"));

test("existe pelo menos um episódio", () => assert.ok(files.length > 0));

for (const f of files) {
  test(`episódio válido: ${f}`, () => {
    const ep = parseEpisode(JSON.parse(readFileSync(`episodes/${f}`, "utf8")), f);
    assert.equal(`${ep.id}.json`, f, "o campo id deve ser igual ao nome do arquivo");
    const chars = ep.scenes.reduce((n, s) => n + s.narration.length, 0);
    // ~13 a 18 caracteres por segundo na voz faber: avisa roteiros muito curtos ou longos.
    const F = FORMATOS[ep.formato];
    assert.ok(chars / 18 <= F.maxDuracao && chars / 13 >= F.minDuracao, `roteiro com ${chars} caracteres fica fora de ${F.minDuracao}–${F.maxDuracao} s`);
  });
}

test("episódio inválido gera mensagem clara", () => {
  assert.throws(() => parseEpisode({ id: "X", title: "", scenes: [] }), /inválido/);
});

test("gráfico de linha exige um valor por rótulo", () => {
  const ep = JSON.parse(readFileSync("episodes/guardar-nao-e-investir.json", "utf8"));
  const chart = ep.scenes.find((s) => s.template === "lineChart");
  chart.data.series[0].values.pop();
  assert.throws(() => parseEpisode(ep), /xLabels/);
});
