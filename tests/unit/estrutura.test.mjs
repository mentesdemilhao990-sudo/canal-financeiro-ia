import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planejar } from "../../scripts/estrutura-canal.mjs";

const cfg = JSON.parse(readFileSync("config/estrutura-canal.json", "utf8"));

test("primeira vez: cria todas as playlists e seções", () => {
  const p = planejar(cfg, { videos: { "guardar-nao-e-investir": "V1" } });
  assert.equal(p.criarPlaylists.length, cfg.playlists.length);
  assert.equal(p.criarSecoes.length, cfg.secoes.length);
});

test("segunda vez: não duplica nada", () => {
  const playlistsExistentes = cfg.playlists.map((p, i) => ({ id: `PL${i}`, titulo: p.titulo.toUpperCase() }));
  const idDe = (ch) => `PL${cfg.playlists.findIndex((p) => p.chave === ch)}`;
  const itensPorPlaylist = {};
  for (const ch of cfg.videosNasPlaylists["guardar-nao-e-investir"]) itensPorPlaylist[idDe(ch)] = ["V1"];
  const secoesExistentes = cfg.secoes.map((s) => (s.tipo === "playlist" ? { tipo: "singlePlaylist", playlists: [idDe(s.playlist)] } : { tipo: s.tipo }));
  const p = planejar(cfg, { playlistsExistentes, itensPorPlaylist, secoesExistentes, videos: { "guardar-nao-e-investir": "V1" } });
  assert.deepEqual(p, { criarPlaylists: [], adicionar: [], criarSecoes: [] });
});

test("config consistente", () => {
  const chaves = new Set(cfg.playlists.map((p) => p.chave));
  for (const s of cfg.secoes) if (s.tipo === "playlist") assert.ok(chaves.has(s.playlist), s.playlist);
  for (const l of Object.values(cfg.videosNasPlaylists)) for (const c of l) assert.ok(chaves.has(c), c);
  for (const p of cfg.playlists) assert.ok(p.titulo.length <= 150 && !/[<>]/.test(p.titulo + p.descricao));
});
