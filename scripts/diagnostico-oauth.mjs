#!/usr/bin/env node
// Diagnóstico do login OAuth do YouTube. Só leitura: não envia vídeo, não muda nada.
// NUNCA imprime valores dos Secrets, tokens ou segredos — só se existem, se o formato
// parece certo e o que o Google respondeu (com qualquer dado sensível ocultado).
//
//   node scripts/diagnostico-oauth.mjs
import { appendFileSync, readFileSync } from "node:fs";
import { DICAS_OAUTH, limparCredencial, sanitizar } from "./lib/youtube-api.mjs";
import { semAcento } from "./lib/metadata.mjs";

const cfg = JSON.parse(readFileSync(process.env.PUBLICACAO_CONFIG ?? "config/publicacao.json", "utf8"));
const out = [];
const linha = (l = "") => {
  out.push(l);
  console.log(l);
};
const fim = (codigo) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.join("\n")}\n`);
  process.exitCode = codigo;
};

export const FORMATOS = {
  YOUTUBE_CLIENT_ID: { re: /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/, esperado: "números-letras.apps.googleusercontent.com" },
  YOUTUBE_CLIENT_SECRET: { re: /^GOCSPX-[\w-]{20,}$/, esperado: "começa com GOCSPX-" },
  YOUTUBE_REFRESH_TOKEN: { re: /^1\/\/[\w-]{20,}$/, esperado: "começa com 1//" },
};

/** Confere os três Secrets sem revelar nada além de sim/não. */
export function conferirSecrets(env) {
  const r = {};
  for (const [nome, f] of Object.entries(FORMATOS)) {
    const bruto = env[nome] ?? "";
    const limpo = limparCredencial(bruto);
    const parece = Object.entries(FORMATOS).find(([n, g]) => n !== nome && g.re.test(limpo))?.[0];
    r[nome] = {
      existe: bruto.length > 0,
      sujeira: bruto.length > 0 && bruto !== limpo,
      formatoOk: f.re.test(limpo),
      pareceOutro: parece ?? null,
      esperado: f.esperado,
    };
  }
  return r;
}

const normaliza = (s) => semAcento(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
export const mesmoCanal = (a, b) => normaliza(a) === normaliza(b);

async function main() {
  linha("## 🔐 Diagnóstico OAuth do YouTube");
  linha("_Nenhum valor de Secret, token ou segredo é mostrado aqui._");
  linha();
  const sec = conferirSecrets(process.env);
  linha("| Secret | Existe | Formato | Observação |");
  linha("| --- | --- | --- | --- |");
  let problemas = 0;
  for (const [nome, s] of Object.entries(sec)) {
    const obs = [];
    if (s.sujeira) obs.push("tinha espaço, quebra de linha ou aspas: limpei automaticamente");
    if (s.pareceOutro) obs.push(`o valor tem cara de **${s.pareceOutro}**: os Secrets podem estar trocados`);
    if (s.existe && !s.formatoOk && !s.pareceOutro) obs.push(`formato inesperado (esperado: ${s.esperado})`);
    if (!s.existe || !s.formatoOk) problemas++;
    linha(`| \`${nome}\` | ${s.existe ? "✅" : "❌ vazio"} | ${!s.existe ? "—" : s.formatoOk ? "✅" : "⚠️"} | ${obs.join("; ") || "—"} |`);
  }
  linha();
  if (Object.values(sec).some((s) => !s.existe)) {
    linha("❌ Falta Secret. Confira se o nome é exatamente esse e se está em **Settings → Secrets and variables → Actions → Repository secrets**.");
    return fim(1);
  }

  const cred = {
    clientId: limparCredencial(process.env.YOUTUBE_CLIENT_ID),
    clientSecret: limparCredencial(process.env.YOUTUBE_CLIENT_SECRET),
    refreshToken: limparCredencial(process.env.YOUTUBE_REFRESH_TOKEN),
  };
  linha("### 1. Troca do refresh token (POST https://oauth2.googleapis.com/token, grant_type=refresh_token)");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cred.clientId, client_secret: cred.clientSecret, refresh_token: cred.refreshToken, grant_type: "refresh_token" }),
  });
  const j = await r.json().catch(() => ({}));
  linha(`- HTTP: **${r.status}**`);
  if (!r.ok || !j.access_token) {
    linha(`- error: \`${sanitizar(j.error ?? "—", cred)}\``);
    linha(`- error_description: ${j.error_description ? `\`${sanitizar(j.error_description, cred)}\`` : "—"}`);
    linha();
    linha(`**O que fazer:** ${DICAS_OAUTH[j.error] ?? "Veja a tabela de problemas comuns em docs/tutorial-youtube.md."}`);
    if (problemas) linha(`Atenção: ${problemas} Secret(s) com formato inesperado na tabela acima. Comece por eles.`);
    return fim(1);
  }
  const escopos = String(j.scope ?? "").split(/\s+/).filter(Boolean);
  linha(`- Login: ✅ access token recebido (não exibido), validade ${j.expires_in ?? "?"} s`);
  linha(`- Escopos concedidos: ${escopos.map((e) => `\`${e.replace("https://www.googleapis.com/auth/", "")}\``).join(", ") || "—"}`);
  const podeEnviar = escopos.some((e) => /youtube(\.force-ssl|\.upload)?$/.test(e));
  const podeComentar = escopos.some((e) => /youtube(\.force-ssl)?$/.test(e));
  linha(`- Enviar vídeo: ${podeEnviar ? "✅" : "❌ falta youtube.force-ssl"} · Comentários: ${podeComentar ? "✅" : "❌ falta youtube.force-ssl"}`);

  linha();
  linha("### 2. Canal desta conta (channels.list mine=true, 1 unidade de cota)");
  const c = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${j.access_token}` } });
  const cj = await c.json().catch(() => ({}));
  linha(`- HTTP: **${c.status}**`);
  if (!c.ok) {
    const motivo = cj.error?.errors?.[0]?.reason ?? cj.error?.status ?? "—";
    linha(`- error: \`${sanitizar(motivo, cred)}\` · ${sanitizar(cj.error?.message ?? "", cred)}`);
    if (motivo === "accessNotConfigured") linha("**O que fazer:** ative a YouTube Data API v3 no projeto do Google Cloud (passo 2 do tutorial).");
    return fim(1);
  }
  const canal = cj.items?.[0];
  if (!canal) {
    linha("❌ A conta autorizada não tem canal. No Playground, escolha o **canal** (não só a conta Google) ao autorizar e gere o token de novo.");
    return fim(1);
  }
  linha(`- Canal: **${canal.snippet.title}** (\`${canal.id}\`)`);
  const esperado = cfg.youtube?.canalEsperado;
  if (esperado) {
    const ok = mesmoCanal(canal.snippet.title, esperado);
    linha(`- Canal esperado (config/publicacao.json → youtube.canalEsperado): “${esperado}” → ${ok ? "✅ confere" : "❌ NÃO confere: envios ficam bloqueados"}`);
    if (!ok) return fim(1);
  }
  linha();
  linha("✅ Autenticação funcionando. Nada foi enviado nem alterado.");
  return fim(0);
}

if (process.argv[1]?.endsWith("diagnostico-oauth.mjs")) {
  try {
    await main();
  } catch (e) {
    linha(`❌ Erro inesperado: ${sanitizar(e.message, { a: process.env.YOUTUBE_CLIENT_SECRET, b: process.env.YOUTUBE_REFRESH_TOKEN })}`);
    fim(1);
  }
}
