// Testes do resultado final: rode depois de build-episode.mjs.
// EPISODE=<id> node --test tests/media/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { parseSrt } from "../../src/lib/captions.mjs";
import { FORMATOS } from "../../src/lib/schema.mjs";

const id = process.env.EPISODE ?? "guardar-nao-e-investir";
const dir = `${process.env.OUT_DIR ?? "out"}/${id}`;
const video = `${dir}/${id}.mp4`;
const info = existsSync(`${dir}/${id}-info.json`) ? JSON.parse(readFileSync(`${dir}/${id}-info.json`, "utf8")) : {};
const allowMock = process.env.ALLOW_MOCK === "1";
const formato = info.formato ?? "short";
const F = FORMATOS[formato];
const capa = formato === "longo" ? { width: 1280, height: 720 } : { width: 1080, height: 1920 };

const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]).toString());
const ffmpegLog = (...args) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args, "-f", "null", "-"], { encoding: "utf8" }).stderr;

test("arquivos gerados existem e não estão vazios", () => {
  for (const f of [`${id}.mp4`, `${id}.srt`, `${id}-roteiro.md`, `${id}-capa.png`]) {
    assert.ok(existsSync(`${dir}/${f}`), `faltando ${f}`);
    assert.ok(statSync(`${dir}/${f}`).size > 100, `${f} vazio`);
  }
});

test("narração veio do Piper (não do modo de teste)", { skip: allowMock }, () => {
  assert.match(info.engine ?? "", /^piper:pt_BR-faber-medium$/);
});

test(`vídeo (${formato}): H.264 ${F.width}x${F.height}, 30 fps, entre ${F.minDuracao} e ${F.maxDuracao} s`, () => {
  const p = probe(video);
  const v = p.streams.find((s) => s.codec_type === "video");
  assert.equal(v.codec_name, "h264");
  assert.equal(v.width, F.width);
  assert.equal(v.height, F.height);
  assert.equal(v.r_frame_rate, "30/1");
  assert.equal(v.pix_fmt, "yuv420p");
  const d = Number(p.format.duration);
  console.log(`duração: ${d.toFixed(2)} s`);
  assert.ok(d >= F.minDuracao && d <= F.maxDuracao, `duração ${d}s fora de ${F.minDuracao}–${F.maxDuracao} s`);
  if (info.targetDurationSeconds) {
    // O Short é curto e precisa bater a meta; no longo a narração escrita pela IA varia mais.
    const folga = formato === "longo" ? 0.35 : 0.2;
    assert.ok(Math.abs(d - info.targetDurationSeconds) <= info.targetDurationSeconds * folga, `duração ${d.toFixed(1)}s longe da meta de ${info.targetDurationSeconds}s (±${folga * 100}%)`);
  }
});

test("áudio: AAC presente e com a mesma duração do vídeo", () => {
  const p = probe(video);
  const a = p.streams.find((s) => s.codec_type === "audio");
  assert.ok(a, "sem faixa de áudio");
  assert.equal(a.codec_name, "aac");
  const v = p.streams.find((s) => s.codec_type === "video");
  assert.ok(Math.abs(Number(a.duration) - Number(v.duration)) < 0.5, `áudio ${a.duration}s x vídeo ${v.duration}s`);
});

test("áudio: volume adequado e sem trechos longos de silêncio", () => {
  const vol = ffmpegLog("-i", video, "-vn", "-af", "volumedetect");
  const mean = Number(vol.match(/mean_volume: (-?[\d.]+) dB/)[1]);
  const max = Number(vol.match(/max_volume: (-?[\d.]+) dB/)[1]);
  console.log(`volume médio ${mean} dB, pico ${max} dB`);
  assert.ok(mean > -32, `áudio baixo demais (${mean} dB)`);
  assert.ok(max <= 0 && max > -12, `pico fora do esperado (${max} dB)`);
  const sil = ffmpegLog("-i", video, "-vn", "-af", "silencedetect=noise=-45dB:d=1.5");
  const gaps = [...sil.matchAll(/silence_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(gaps, [], `silêncios longos encontrados: ${gaps.join(", ")} s`);
});

test("vídeo: sem quadros pretos nem congelados por muito tempo", () => {
  const black = ffmpegLog("-i", video, "-an", "-vf", "blackdetect=d=0.5:pix_th=0.05");
  assert.doesNotMatch(black, /black_start/, "trecho preto detectado");
  const frozen = ffmpegLog("-i", video, "-an", "-vf", "freezedetect=n=0.0005:d=3");
  assert.doesNotMatch(frozen, /freeze_start/, "imagem parada por mais de 3 s");
});

test("legendas SRT: válidas, em ordem e dentro da duração", () => {
  const cues = parseSrt(readFileSync(`${dir}/${id}.srt`, "utf8"));
  const d = Number(probe(video).format.duration);
  assert.ok(cues.length >= 5);
  cues.forEach((c, i) => {
    assert.equal(c.index, i + 1);
    assert.ok(c.end > c.start, `legenda ${i + 1} com tempo inválido`);
    assert.ok(c.text.trim().length > 0);
    if (i) assert.ok(c.start >= cues[i - 1].end - 0.001, `legenda ${i + 1} sobrepõe a anterior`);
  });
  assert.ok(cues.at(-1).end <= d + 0.3, "última legenda passa do fim do vídeo");
});

test(`capa: PNG ${capa.width}x${capa.height}`, () => {
  const s = probe(`${dir}/${id}-capa.png`).streams[0];
  assert.equal(s.width, capa.width);
  assert.equal(s.height, capa.height);
});
