#!/usr/bin/env node
// Gera um episódio completo: narração (Piper) -> vídeo (Remotion) -> SRT, roteiro e capa.
//
// Uso: node scripts/build-episode.mjs episodes/meu-episodio.json [--mock] [--out out]
//   --mock  usa narração sintética (sem Piper), só para conferir o visual.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { parseEpisode } from "../src/lib/schema.mjs";
import { groupWords, srtTime, toSrt } from "../src/lib/captions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const episodeFile = args.find((a) => a.endsWith(".json"));
if (!episodeFile) {
  console.error("Uso: node scripts/build-episode.mjs episodes/<episodio>.json [--mock]");
  process.exit(1);
}

const mock = flag("--mock");
const python = process.env.PYTHON ?? "python3";
const outRoot = path.resolve(ROOT, opt("--out", "out"));
const episode = parseEpisode(JSON.parse(readFileSync(episodeFile, "utf8")), episodeFile);
const channel = JSON.parse(readFileSync(path.join(ROOT, "config/channel.json"), "utf8"));
const id = episode.id;
const buildDir = path.join(ROOT, "build", id);
const publicGen = path.join(ROOT, "public", "generated", id);
const outDir = path.join(outRoot, id);

const step = (msg) => console.log(`\n▶ ${msg}`);
const t0 = Date.now();

// 1) Narração + linha do tempo
step(`Narração (${mock ? "mock" : "Piper " + (channel.voice?.model ?? "pt_BR-faber-medium")})`);
const tts = spawnSync(
  python,
  ["scripts/tts.py", "--episode", episodeFile, "--out", buildDir, ...(mock ? ["--mock"] : []), "--voice-dir", process.env.VOICE_DIR ?? "voices"],
  { cwd: ROOT, stdio: "inherit" },
);
if (tts.status !== 0) process.exit(tts.status ?? 1);
const timeline = JSON.parse(readFileSync(path.join(buildDir, "timeline.json"), "utf8"));

rmSync(publicGen, { recursive: true, force: true });
mkdirSync(publicGen, { recursive: true });
copyFileSync(path.join(buildDir, "narration.wav"), path.join(publicGen, "narration.wav"));
const hasAmbient = existsSync(path.join(buildDir, "ambient.wav"));
if (hasAmbient) copyFileSync(path.join(buildDir, "ambient.wav"), path.join(publicGen, "ambient.wav"));

const inputProps = {
  episode,
  timeline,
  channel: { name: channel.name, handle: channel.handle },
  audio: {
    narration: `generated/${id}/narration.wav`,
    ambient: hasAmbient ? `generated/${id}/ambient.wav` : null,
  },
};

// 2) Vídeo
step("Empacotando o projeto Remotion");
const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src/index.ts"), publicDir: path.join(ROOT, "public") });
const browserExecutable = process.env.REMOTION_BROWSER ?? null;
const chromiumOptions = {};

mkdirSync(outDir, { recursive: true });
const videoPath = path.join(outDir, `${id}.mp4`);
const composition = await selectComposition({ serveUrl, id: "Episode", inputProps, browserExecutable, chromiumOptions });
step(`Renderizando ${composition.durationInFrames} quadros (${(composition.durationInFrames / composition.fps).toFixed(1)}s, ${composition.width}x${composition.height})`);
let last = -1;
await renderMedia({
  serveUrl,
  composition,
  inputProps,
  codec: "h264",
  pixelFormat: "yuv420p",
  crf: 20,
  audioCodec: "aac",
  audioBitrate: "192k",
  outputLocation: videoPath,
  browserExecutable,
  chromiumOptions,
  concurrency: Number(process.env.RENDER_CONCURRENCY ?? 0) || null,
  onProgress: ({ progress }) => {
    const p = Math.floor(progress * 10);
    if (p !== last) {
      last = p;
      console.log(`  ${p * 10}%`);
    }
  },
});

// 3) Capa
step("Capa");
const cover = await selectComposition({ serveUrl, id: "Cover", inputProps, browserExecutable, chromiumOptions });
await renderStill({ serveUrl, composition: cover, inputProps, output: path.join(outDir, `${id}-capa.png`), browserExecutable, chromiumOptions });

// 4) Legendas e roteiro
step("Legendas e roteiro");
const words = timeline.scenes.flatMap((s) => s.words);
const cues = groupWords(words, { maxWords: 7, maxChars: 42, maxGap: 0.5 });
writeFileSync(path.join(outDir, `${id}.srt`), toSrt(cues), "utf8");

const mmss = (s) => srtTime(s).slice(3, 8);
const roteiro = [
  `# ${episode.title}`,
  "",
  `**Duração:** ${timeline.duration.toFixed(1)} s · **Formato:** 1080x1920 · **Voz:** ${timeline.engine}`,
  "",
  "## Descrição",
  "",
  episode.description,
  "",
  `**Tags:** ${episode.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")}`,
  "",
  "## Roteiro",
  "",
  ...episode.scenes.flatMap((s, i) => {
    const t = timeline.scenes[i];
    return [`### Cena ${i + 1} · ${s.template} · ${mmss(t.start)}–${mmss(t.end)}`, "", s.narration, ""];
  }),
  ...(episode.disclaimer ? ["---", "", `_${episode.disclaimer}_`, ""] : []),
].join("\n");
writeFileSync(path.join(outDir, `${id}-roteiro.md`), roteiro, "utf8");
writeFileSync(
  path.join(outDir, `${id}-info.json`),
  JSON.stringify({ id, title: episode.title, duration: timeline.duration, engine: timeline.engine, alignment: timeline.alignment, targetDurationSeconds: episode.targetDurationSeconds }, null, 2),
);

console.log(`\n✔ Pronto em ${((Date.now() - t0) / 1000).toFixed(0)}s → ${path.relative(ROOT, outDir)}/`);
