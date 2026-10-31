import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { novoBranding } from "../../scripts/perfil-canal.mjs";

test("novoBranding mantém campos e troca descrição e banner", () => {
  const atual = { channel: { title: "Mente De milhão", country: "BR", description: "velha" }, image: { outro: 1 } };
  const b = novoBranding(atual, { descricao: "nova", bannerUrl: "https://x/banner" });
  assert.equal(b.channel.description, "nova");
  assert.equal(b.channel.country, "BR");
  assert.equal(b.image.bannerExternalUrl, "https://x/banner");
  assert.equal(b.image.outro, 1);
  assert.match(b.channel.keywords, /"educação financeira"/);
  assert.equal(atual.channel.description, "velha");
});

test("arquivos da marca existem e respeitam limites do YouTube", () => {
  const desc = readFileSync("marca/descricao.txt", "utf8");
  assert.ok(desc.length > 50 && desc.length <= 1000);
  assert.ok(!/[<>]/.test(desc), "YouTube recusa < e > na descrição");
  assert.ok(statSync("marca/banner.png").size < 6 * 1024 * 1024);
  const pedido = JSON.parse(readFileSync("pedidos/perfil.json", "utf8"));
  assert.notEqual(pedido.confirmacao, "ATUALIZAR-PERFIL", "o pedido não deve vir confirmado por padrão");
});
