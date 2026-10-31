#!/usr/bin/env node
// Atualiza a descrição e o banner do canal do YouTube a partir de marca/.
// Só age com pedidos/perfil.json { confirmacao: "ATUALIZAR-PERFIL" } e quando o
// canal conectado é o esperado em config/publicacao.json. A foto de perfil não
// tem API: ela é trocada à mão no YouTube Studio.
import { appendFileSync, readFileSync } from "node:fs";
import { YouTube, credenciaisDoAmbiente, sanitizar } from "./lib/youtube-api.mjs";
import { semAcento } from "./lib/metadata.mjs";

const API = "https://www.googleapis.com/youtube/v3";
const BANNER_UPLOAD = "https://www.googleapis.com/upload/youtube/v3/channelBanners/insert";
export const PALAVRAS_CHAVE = ["educação financeira", "finanças pessoais", "dinheiro", "investimentos para iniciantes", "juros compostos", "sair das dívidas", "Mente de Milhão"];

const out = [];
const linha = (l = "") => {
  out.push(l);
  console.log(l);
};
const normaliza = (s) => semAcento(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();

/** brandingSettings novo: mantém o que já existe e troca só descrição/palavras-chave/banner. */
export function novoBranding(atual = {}, { descricao, bannerUrl } = {}) {
  const b = structuredClone(atual);
  b.channel = { ...(b.channel ?? {}) };
  if (descricao !== undefined) {
    b.channel.description = descricao;
    b.channel.keywords = PALAVRAS_CHAVE.map((p) => (p.includes(" ") ? `"${p}"` : p)).join(" ");
  }
  if (bannerUrl) b.image = { ...(b.image ?? {}), bannerExternalUrl: bannerUrl };
  return b;
}

async function main() {
  const pedido = JSON.parse(readFileSync(process.env.PEDIDO_PERFIL ?? "pedidos/perfil.json", "utf8"));
  linha("## 🎨 Perfil do canal");
  if (String(pedido.confirmacao ?? "").trim() !== "ATUALIZAR-PERFIL") {
    linha("Pedido sem confirmacao ATUALIZAR-PERFIL: nada foi alterado.");
    return 0;
  }
  const cred = credenciaisDoAmbiente();
  if (!cred) {
    linha("❌ Faltam os Secrets do YouTube.");
    return 1;
  }
  const cfg = JSON.parse(readFileSync("config/publicacao.json", "utf8"));
  const yt = new YouTube({ credenciais: cred, cota: { reservar() {} } });

  const atual = await yt.get("channels.list", "channels", { part: "snippet,brandingSettings", mine: "true" });
  const canal = atual.items?.[0];
  if (!canal) throw new Error("Esta conta Google não tem canal do YouTube.");
  linha(`Canal conectado: **${canal.snippet.title}**`);
  if (normaliza(canal.snippet.title) !== normaliza(cfg.youtube.canalEsperado)) {
    linha(`❌ Esperado "${cfg.youtube.canalEsperado}". Nada foi alterado.`);
    return 1;
  }

  const mudar = {};
  if (pedido.descricao) mudar.descricao = readFileSync("marca/descricao.txt", "utf8").trim();
  if (pedido.banner) {
    if (!yt.token) await yt.autenticar();
    const r = await yt.fetch(`${BANNER_UPLOAD}?uploadType=media`, {
      method: "POST",
      headers: { authorization: `Bearer ${yt.token}`, "content-type": "image/png" },
      body: readFileSync("marca/banner.png"),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error(`Envio do banner falhou: ${j.error?.message ?? r.status}`);
    mudar.bannerUrl = j.url;
    linha("✅ Banner enviado ao YouTube.");
  }

  const branding = novoBranding(canal.brandingSettings, mudar);
  await yt.chamar("channels.update", `${API}/channels?part=brandingSettings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: canal.id, brandingSettings: branding }),
  });

  const depois = (await yt.get("channels.list", "channels", { part: "brandingSettings", id: canal.id })).items?.[0]?.brandingSettings ?? {};
  if (mudar.descricao !== undefined)
    linha(depois.channel?.description?.trim() === mudar.descricao ? "✅ Descrição atualizada." : "⚠️ O YouTube não confirmou a descrição nova.");
  if (mudar.bannerUrl) linha(depois.image?.bannerExternalUrl ? "✅ Banner aplicado ao canal." : "⚠️ O YouTube não confirmou o banner novo.");
  linha("Foto de perfil: troque à mão no YouTube Studio (a API não permite).");
  return 0;
}

if (process.argv[1]?.endsWith("perfil-canal.mjs")) {
  let codigo = 1;
  try {
    codigo = await main();
  } catch (e) {
    linha(`❌ ${sanitizar(e.message, { a: process.env.YOUTUBE_CLIENT_SECRET, b: process.env.YOUTUBE_REFRESH_TOKEN })}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.join("\n")}\n`);
  process.exitCode = codigo;
}
