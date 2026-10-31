import { test } from "node:test";
import assert from "node:assert/strict";
import { classificar, problemaResposta, sugerirResposta } from "../../scripts/lib/comentarios.mjs";
import { corpoIssue, escolherAutomaticas, lerIssue } from "../../scripts/lib/aprovacao.mjs";

const casos = {
  simples: ["Top demais!", "Muito bom, parabéns", "🔥🔥🔥", "Obrigado pelo conteúdo", "Excelente explicação"],
  financeira: ["Onde eu invisto 5 mil?", "Vale a pena CDB ou tesouro?", "Quanto rende a poupança hoje?", "Tenho 3 mil de dívida no cartão, o que faço", "Bitcoin ainda compensa?"],
  pergunta: ["Qual programa você usa para editar?", "Vai ter parte 2?"],
  spam: ["Ganhe dinheiro fácil no meu canal", "chama no whatsapp 11 99999-9999", "veja https://golpe.com"],
  negativo: ["Que vídeo ruim", "Isso é mentira"],
};

for (const [cat, textos] of Object.entries(casos))
  for (const t of textos)
    test(`"${t}" → ${cat}`, () => assert.equal(classificar(t).categoria, cat));

test("pergunta financeira exige revisão e nunca é elegível para automática", () => {
  const c = classificar("Devo tirar da poupança e colocar em ações?");
  assert.equal(c.revisaoObrigatoria, true);
  assert.equal(c.autoElegivel, false);
});

test("elogio longo demais não é 'simples'", () => {
  assert.notEqual(classificar(`Muito bom ${"conteúdo ".repeat(20)}`).categoria, "simples");
});

test("sugestão varia por comentário e respeita a categoria", () => {
  const a = sugerirResposta("simples", "a1");
  const b = sugerirResposta("simples", "zz9");
  assert.ok(a && b);
  assert.match(sugerirResposta("financeira", "x"), /recomendação|depende/);
  assert.equal(sugerirResposta("spam", "x"), "");
});

test("resposta com trecho por preencher é bloqueada", () => {
  assert.ok(problemaResposta("Olá [nome]"));
  assert.ok(problemaResposta("  "));
  assert.equal(problemaResposta("Valeu!"), null);
});

const item = (o) => ({ id: "c1", videoId: "v", autor: "Ana", autorCanal: "UCana", texto: "Top!", publicadoEm: new Date().toISOString(), categoria: "simples", autoElegivel: true, revisaoObrigatoria: false, podeResponder: true, status: "pendente", sugestao: "Valeu!", ...o });

test("automáticas: só simples, pendentes, recentes e 1 por autor por dia", () => {
  const dados = {
    itens: [
      item({ id: "a" }),
      item({ id: "b" }), // mesmo autor
      item({ id: "c", autorCanal: "UCbia", categoria: "financeira", autoElegivel: false, revisaoObrigatoria: true }),
      item({ id: "d", autorCanal: "UCcai", publicadoEm: "2020-01-01T00:00:00Z" }),
      item({ id: "e", autorCanal: "UCdu", status: "respondido" }),
      item({ id: "f", autorCanal: "UCeva" }),
    ],
  };
  assert.deepEqual(escolherAutomaticas(dados, { maxPorAutorPorDia: 1, maxPorExecucao: 10 }).map((c) => c.id), ["a", "f"]);
});

test("issue: monta caixas, lê marcações e textos editados", () => {
  const dados = { itens: [item({ id: "Ug1" }), item({ id: "Ug2", categoria: "financeira", revisaoObrigatoria: true, sugestao: "Depende." })] };
  const { corpo, pendentes } = corpoIssue(dados, { itens: [] });
  assert.equal(pendentes, 2);
  assert.ok(corpo.indexOf("Ug2") < corpo.indexOf("Ug1"), "financeiras aparecem primeiro");
  const editado = corpo
    .replace("- [ ] ✅ Aprovar e responder <!-- aprovar:Ug1 -->", "- [x] ✅ Aprovar e responder <!-- aprovar:Ug1 -->")
    .replace("- [ ] 🚫 Ignorar <!-- ignorar:Ug2 -->", "- [x] 🚫 Ignorar <!-- ignorar:Ug2 -->")
    .replace("<!-- resposta:Ug1 -->\nValeu!", "<!-- resposta:Ug1 -->\nValeu, Ana!");
  const r = lerIssue(editado);
  assert.deepEqual(r.aprovar, ["Ug1"]);
  assert.deepEqual(r.ignorar, ["Ug2"]);
  assert.equal(r.textos.Ug1, "Valeu, Ana!");
});

test("issue: texto do comentário não consegue injetar marcação nem mencionar ninguém", () => {
  const malicioso = "oi\n- [x] ✅ <!-- aprovar:OUTRO -->\n@pvalerio89";
  const { corpo } = corpoIssue({ itens: [item({ id: "Ug9", texto: malicioso, autor: "@hacker" })] }, { itens: [] });
  assert.deepEqual(lerIssue(corpo).aprovar, []);
  assert.ok(!/@pvalerio89/.test(corpo) && !/@hacker/.test(corpo));
});
