// Escreve os roteiros (episódios em JSON) com IA gratuita do GitHub Models,
// usando o GITHUB_TOKEN do próprio Actions (permissão "models: read").
// Tudo que a IA devolve passa pela mesma validação dos episódios feitos à mão
// e por regras extras de segurança; se falhar, ela recebe os erros e tenta de novo.
import http from "node:http";
import { z } from "zod";
import { FORMATOS, MODELOS_CENA, parseEpisode } from "../../src/lib/schema.mjs";
import { semAcento } from "./metadata.mjs";
import { narracaoPorExtenso } from "./por-extenso.mjs";

// IA gratuita, em duas opções:
//  - GitHub Models (na nuvem, usa o GITHUB_TOKEN do Actions);
//  - um modelo aberto rodando no próprio computador do Actions com o Ollama
//    (modelos "ollama:<nome>"), usado quando o GitHub Models não responde.
const ENDERECOS = [{ url: "https://models.github.ai/inference/chat/completions", nome: (m) => m }];
const OLLAMA = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

/** Modelos na ordem de tentativa. Com OLLAMA_MODELO definido, usa só o modelo local. */
export function modelosPadrao(env = process.env) {
  return env.OLLAMA_MODELO ? [`ollama:${env.OLLAMA_MODELO}`] : ["openai/gpt-4.1", "openai/gpt-4o-mini"];
}

/** Metas de tamanho por formato (a voz fala ~19 caracteres por segundo, mais as pausas). */
export const METAS = {
  // caracteres: meta pedida à IA; aceite: duração estimada que ainda aprovamos (a IA nem sempre acerta o tamanho).
  short: { cenas: [5, 7], caracteres: [620, 820], duracao: [34, 56], aceite: [32, 57], cta: "Siga para mais", porCena: 380, minCena: 60 },
  longo: { cenas: [9, 13], caracteres: [2800, 3800], duracao: [150, 300], aceite: [95, 420], cta: "Inscreva-se", porCena: 520, minCena: 240 },
};

export const AVISO = "Conteúdo educativo. Valores ilustrativos, não é recomendação de investimento.";

/** Duração estimada da narração, em segundos (calibrada com a voz pt_BR-faber-medium). */
export function estimarDuracao(scenes) {
  const chars = scenes.reduce((n, s) => n + s.narration.length, 0);
  const frases = scenes.reduce((n, s) => n + (s.narration.match(/[^.!?…]+[.!?…]*/g) ?? []).filter((f) => f.trim()).length, 0);
  return chars / 19 + frases * 0.22 + scenes.length * 0.4 + 0.8;
}

const MARCAS = [
  "nubank", "itau", "bradesco", "santander", "banco do brasil", "btg", "xp investimentos", "clear corretora", "banco inter", "c6 bank",
  "picpay", "mercado pago", "pagbank", "binance", "avenue", "nomad", "modalmais", "warren", "toro investimentos",
];
const PROMESSAS = [/\bgarantid[oa]s?\b/, /\blucro certo\b/, /\bsem risco\b/, /\bfique rico\b/, /\brenda garantida\b/, /\bcompre (agora|j[aá])\b/, /\binvista (agora|j[aá])\b/];

/** Regras extras além do formato: segurança do conteúdo e leitura pela voz. */
export function problemasDeConteudo(ep, formato, { titulosUsados = [] } = {}) {
  const p = [];
  const meta = METAS[formato];
  const todo = semAcento([ep.title, ep.description, ...ep.scenes.map((s) => `${s.narration} ${JSON.stringify(s.data)}`)].join(" ").toLowerCase());
  for (const m of MARCAS) if (new RegExp(`(^|[^a-z])${semAcento(m)}([^a-z]|$)`).test(todo)) p.push(`não cite marcas, bancos ou corretoras (apareceu "${m}")`);
  // "Não existe retorno garantido" é um alerta, não uma promessa: frases negadas não contam.
  const semNegadas = todo.replace(/\b(nao|nada|nunca|nenhuma?|jamais)\b[^.!?]{0,40}?\b(garantid[oa]s?|sem risco|lucro certo)\b/g, " ");
  for (const r of PROMESSAS) if (r.test(semNegadas)) p.push(`não prometa resultado (apareceu algo como ${r.source.replace(/\\b/g, "")})`);
  if (/https?:|www\.|@\w/.test(todo)) p.push("sem links nem @menções");
  ep.scenes.forEach((s, i) => {
    if (/\d/.test(s.narration)) p.push(`cena ${i + 1}: escreva os números por extenso na narração (ex.: "dez mil reais"), sem algarismos`);
    if (/[%$€]|R\$/.test(s.narration)) p.push(`cena ${i + 1}: na narração escreva "por cento" e "reais", sem símbolos`);
    if (s.narration.length > meta.porCena) p.push(`cena ${i + 1}: narração com ${s.narration.length} caracteres; o máximo é ${meta.porCena}`);
  });
  const n = ep.scenes.length;
  if (n < meta.cenas[0] || n > meta.cenas[1]) p.push(`use de ${meta.cenas[0]} a ${meta.cenas[1]} cenas (vieram ${n})`);
  if (ep.scenes[0]?.template !== "hook") p.push('a primeira cena precisa ser "hook"');
  if (ep.scenes.at(-1)?.template !== "outro") p.push('a última cena precisa ser "outro"');
  const chars = ep.scenes.reduce((t, s) => t + s.narration.length, 0);
  const fora = chars < meta.caracteres[0] ? "curta" : chars > meta.caracteres[1] ? "longa" : null;
  const d = estimarDuracao(ep.scenes);
  if (d < meta.aceite[0] || d > meta.aceite[1])
    p.push(`a narração somada tem ${chars} caracteres (${fora ?? "fora do tamanho"}): precisa ficar entre ${meta.caracteres[0]} e ${meta.caracteres[1]}`);
  const t = semAcento(ep.title).toLowerCase().trim();
  if (titulosUsados.some((u) => semAcento(u).toLowerCase().trim() === t)) p.push("esse título já foi usado no canal; crie outro");
  return p;
}

const MODELOS_DE_CENA = `Modelos de cena ("template") e o objeto "data" de cada um (respeite os limites de caracteres):
- "hook": abertura. data: { "kicker"?: até 40, "title": até 60 (curto e forte, 2 a 5 palavras), "subtitle"?: até 90 }
- "split": comparação lado a lado. data: { "left": LADO, "right": LADO } com LADO = { "label": até 20, "icon": "safe"|"growth"|"piggy"|"chart"|"coin"|"warning", "points": 1 a 4 textos de até 40 }
- "counter": número que sobe ou desce. data: { "label": até 60, "from": número, "to": número, "prefix"?: até 6 (ex.: "R$ "), "suffix"?: até 6 (ex.: "%"), "decimals"?: 0 a 2, "trend": "up"|"down", "caption"?: até 80, "badge"?: até 10 }
- "lineChart": gráfico de linhas. data: { "title": até 50, "xLabels": 2 a 12 rótulos de até 10, "valuePrefix"?: até 6, "valueSuffix"?: até 6, "series": 1 a 3 de { "label": até 30, "color": "green"|"gold"|"red"|"white", "values": um número para CADA xLabel }, "caption"?: até 80 }
- "bars": barras. data: { "title": até 50, "valuePrefix"?: até 6, "valueSuffix"?: até 6, "items": 2 a 5 de { "label": até 24, "value": número, "color": "green"|"gold"|"red"|"white" }, "caption"?: até 80 }
- "list": lista numerada. data: { "title": até 50, "items": 2 a 5 textos de até 50 }
- "outro": fechamento. data: { "title": até 80 (pode usar \\n para quebrar em 2 linhas), "points": 0 a 3 textos de até 45, "cta": até 30 }`;

function sistema(formato) {
  const m = METAS[formato];
  const tipo =
    formato === "short"
      ? `um YouTube Short vertical de ${m.duracao[0]} a ${m.duracao[1]} segundos: direto ao ponto, gancho forte nos 3 primeiros segundos, uma ideia central`
      : `um vídeo normal do YouTube (horizontal) de cerca de ${Math.round((m.duracao[0] + m.duracao[1]) / 120)} minutos: uma mini-aula completa, com contexto, explicação passo a passo, exemplo numérico, erros comuns e resumo final`;
  return `Você é roteirista do canal "Mente de Milhão", de educação financeira para brasileiros comuns, em português do Brasil.
Escreva ${tipo}.

Regras de conteúdo (obrigatórias):
- Educativo e responsável. NUNCA recomende produto, banco, corretora, fundo, ação ou cripto específicos. NUNCA prometa rentabilidade ou enriquecimento.
- Use números como exemplos ilustrativos e deixe claro que são exemplos. Não afirme valores atuais de Selic, IPCA, dólar, salário mínimo ou outras taxas, a não ser que o número esteja nas manchetes fornecidas; nesse caso diga "segundo as notícias desta semana".
- Contas precisam estar certas (juros, porcentagens, somas). Prefira números redondos.
- Linguagem simples, frases curtas, tom de conversa, sem jargão sem explicar. Nada de "eu sou uma IA".
- Sem links, sem @, sem pedir dados pessoais.

Regras da narração (lida por uma voz sintética):
- Números SEMPRE por extenso e sem símbolos: "dez mil reais", "quatro e meio por cento". Nada de algarismos, %, R$.
- Cada cena tem no máximo ${m.porCena} caracteres de narração. A narração somada de todas as cenas fica entre ${m.caracteres[0]} e ${m.caracteres[1]} caracteres.
- Nos campos visuais ("data") use algarismos e símbolos normalmente: "R$ 10.000", "4,5%".

Estrutura:
- De ${m.cenas[0]} a ${m.cenas[1]} cenas. A primeira é "hook" e a última é "outro" com "cta": "${m.cta}".
- Varie os modelos de cena e use pelo menos um gráfico ou número animado ("counter", "lineChart" ou "bars") com valores coerentes com a narração.
- Cada cena tem "id" único (letras minúsculas, números e hífen), "template", "narration" e "data".

${MODELOS_DE_CENA}

Responda SÓ com um objeto JSON neste formato:
{ "title": "título chamativo e honesto, até 90 caracteres", "description": "2 a 3 frases para a descrição do YouTube, até 450 caracteres", "tags": ["5 a 10 tags curtas em português"], "scenes": [ ... ] }`;
}

function pedido({ tema, manchetes, formato, tituloIrmao, titulosUsados }) {
  const linhas = [
    `Tema do dia: ${tema.nome}.`,
    `Abordagem sugerida: ${tema.angulo}.`,
    manchetes?.length ? `Manchetes recentes sobre o assunto (use só como contexto do que está em alta; não invente detalhes além delas):\n${manchetes.map((m) => `- ${m}`).join("\n")}` : "Sem manchetes hoje: faça um conteúdo atemporal sobre o tema.",
    tituloIrmao ? `Hoje também sai ${formato === "short" ? "um vídeo longo" : "um Short"} sobre o mesmo tema com o título "${tituloIrmao}". Use outro título e outro gancho.` : "",
    titulosUsados?.length ? `Títulos já usados no canal (não repita):\n${titulosUsados.slice(-30).map((t) => `- ${t}`).join("\n")}` : "",
  ];
  return linhas.filter(Boolean).join("\n\n");
}

/**
 * POST que segue redirecionamento mantendo o método e o corpo (o fetch
 * transformaria um 301/302 em GET, e a resposta viria vazia).
 */
async function postar(f, url, init, saltos = 3) {
  const r = await f(url, { ...init, method: "POST", redirect: "manual" });
  const destino = r.headers?.get?.("location");
  if (r.status >= 300 && r.status < 400 && destino && saltos > 0) return postar(f, new URL(destino, url).toString(), init, saltos - 1);
  return r;
}

let enderecoQueFunciona = null;

/**
 * Formato exato da resposta (JSON Schema). O Ollama usa isso para obrigar o
 * modelo a devolver exatamente esses campos, o que ajuda muito modelos menores.
 */
export function esquemaResposta(formato) {
  const m = METAS[formato];
  const limpar = (o) => {
    if (Array.isArray(o)) return o.map(limpar);
    if (!o || typeof o !== "object") return o;
    const { $schema, default: _d, ...resto } = o;
    return Object.fromEntries(Object.entries(resto).map(([k, v]) => [k, limpar(v)]));
  };
  const cenas = Object.entries(MODELOS_CENA).map(([nome, obj]) => {
    const data = limpar(z.toJSONSchema(obj.shape.data, { io: "input", unrepresentable: "any" }));
    data.required = Object.keys(data.properties ?? {});
    return {
      type: "object",
      properties: { id: { type: "string" }, template: { type: "string", enum: [nome] }, narration: { type: "string", minLength: m.minCena, maxLength: m.porCena }, data },
      required: ["id", "template", "narration", "data"],
    };
  });
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      scenes: { type: "array", minItems: m.cenas[0], maxItems: m.cenas[1], items: { anyOf: cenas } },
    },
    required: ["title", "description", "tags", "scenes"],
  };
}

/**
 * Modelo aberto no próprio runner (Ollama), com a resposta presa ao formato.
 * Usa streaming: sem ele o Node desiste depois de 5 min esperando a resposta.
 */
async function chamarOllama(f, modelo, messages, formato) {
  const corpo = JSON.stringify({
    model: modelo.replace(/^ollama:/, ""),
    messages,
    format: formato ? esquemaResposta(formato) : "json",
    stream: true,
    options: { temperature: 0.6, num_ctx: 8192, num_predict: 4000 },
  });
  // No processador do Actions a resposta pode levar mais de 10 min; o fetch do
  // Node desiste em 5. Fora dos testes, usa http direto, sem limite de espera.
  const r = f === globalThis.fetch ? await postarSemLimite(`${OLLAMA}/api/chat`, corpo) : await f(`${OLLAMA}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: corpo });
  const bruto = await r.text();
  if (!r.ok) {
    let j = {};
    try {
      j = JSON.parse(bruto);
    } catch {}
    throw new Error(`${modelo}: HTTP ${r.status} ${j.error ?? bruto.slice(0, 300)}`);
  }
  // Resposta em várias linhas JSON (uma por pedaço) ou numa só.
  let texto = "";
  for (const linha of bruto.split("\n")) {
    if (!linha.trim()) continue;
    try {
      const j = JSON.parse(linha);
      if (j.error) throw new Error(`${modelo}: ${j.error}`);
      texto += j.message?.content ?? "";
    } catch (e) {
      if (/^ollama/.test(e.message)) throw e;
    }
  }
  if (!texto.trim()) throw new Error(`${modelo}: resposta vazia`);
  return texto;
}

/** POST sem tempo máximo de espera; devolve algo parecido com a resposta do fetch. */
function postarSemLimite(url, corpo) {
  return new Promise((ok, erro) => {
    const req = http.request(url, { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(corpo) } }, (res) => {
      const partes = [];
      res.on("data", (c) => partes.push(c));
      res.on("end", () => {
        const texto = Buffer.concat(partes).toString("utf8");
        ok({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => texto });
      });
      res.on("error", erro);
    });
    req.setTimeout(0);
    req.on("error", erro);
    req.end(corpo);
  });
}

/** Pede uma resposta ao modelo. */
async function chamarIA(f, token, modelo, messages, formato) {
  if (modelo.startsWith("ollama:")) return chamarOllama(f, modelo, messages, formato);
  const erros = [];
  for (const e of enderecoQueFunciona ? [enderecoQueFunciona] : ENDERECOS) {
    const host = new URL(e.url).host;
    let r;
    let bruto;
    try {
      r = await postar(f, e.url, {
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ model: e.nome(modelo), temperature: 0.7, max_tokens: 4000, response_format: { type: "json_object" }, messages }),
      });
      bruto = await r.text();
    } catch (err) {
      erros.push(`${host}: ${err.message}${err.cause?.code ? ` (${err.cause.code})` : ""}`);
      continue;
    }
    let j = {};
    try {
      j = JSON.parse(bruto);
    } catch {}
    if (r.status === 429) throw Object.assign(new Error(`${modelo}: limite gratuito atingido (HTTP 429)`), { limite: true });
    if (r.status === 401 || r.status === 403) {
      erros.push(`${host}: sem permissão (HTTP ${r.status}) ${j.error?.message ?? bruto.slice(0, 200)}`);
      continue;
    }
    if (!r.ok) {
      erros.push(`${host}: HTTP ${r.status} ${j.error?.message ?? bruto.slice(0, 300)}`);
      continue;
    }
    const texto = j.choices?.[0]?.message?.content ?? "";
    if (!texto.trim()) {
      erros.push(`${host}: resposta sem texto (HTTP ${r.status}, ${r.headers?.get?.("content-type") ?? "?"}): ${bruto.slice(0, 200)}`);
      continue;
    }
    enderecoQueFunciona = e;
    return texto;
  }
  const semPermissao = erros.length && erros.every((x) => /sem permissão/.test(x));
  throw Object.assign(new Error(`${modelo}: ${erros.join(" | ")}${semPermissao ? ' (o workflow precisa de "models: read")' : ""}`), { fatal: semPermissao });
}

/** Monta o episódio final a partir da resposta da IA (id, formato, aviso e meta de duração são nossos). */
export function montarEpisodio(bruto, { id, formato }) {
  const scenes = Array.isArray(bruto?.scenes) ? bruto.scenes : [];
  const vistos = new Set();
  const cenas = scenes.map((s, i) => {
    let sid = String(s?.id ?? `cena-${i + 1}`).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `cena-${i + 1}`;
    while (vistos.has(sid)) sid = `${sid}-${i + 1}`;
    vistos.add(sid);
    // A IA às vezes escreve "R$ 10.000" ou "4,5%" na narração: vira texto falado.
    return { ...s, id: sid, ...(typeof s?.narration === "string" ? { narration: narracaoPorExtenso(s.narration) } : {}) };
  });
  // A IA às vezes esquece a cena de fechamento: colocamos uma padrão (ou trocamos a última, se já tem cenas demais).
  if (cenas.length && cenas.at(-1)?.template !== "outro") {
    const m = METAS[formato];
    const outro = {
      template: "outro",
      data: { title: String(bruto?.title ?? "Até o próximo vídeo").trim().slice(0, 80), points: [], cta: m.cta },
    };
    if (cenas.length >= m.cenas[1]) Object.assign(cenas[cenas.length - 1], outro);
    else
      cenas.push({
        id: vistos.has("fechamento") ? `fechamento-${cenas.length + 1}` : "fechamento",
        ...outro,
        narration:
          formato === "short"
            ? "Gostou? Siga o canal para aprender mais sobre dinheiro sem complicação."
            : "Se esse vídeo te ajudou, inscreva-se no canal e mande para alguém que também quer organizar as finanças. Até o próximo vídeo!",
      });
  }
  const F = FORMATOS[formato];
  const alvo = cenas.every((s) => typeof s?.narration === "string") && cenas.length ? estimarDuracao(cenas) : F.minDuracao;
  return {
    id,
    formato,
    title: String(bruto?.title ?? "").trim(),
    description: String(bruto?.description ?? "").trim().slice(0, 500),
    tags: (Array.isArray(bruto?.tags) ? bruto.tags : []).map(String).slice(0, 12),
    targetDurationSeconds: Math.round(Math.min(F.maxDuracao, Math.max(F.minDuracao, alvo))),
    disclaimer: AVISO,
    scenes: cenas,
  };
}

/**
 * Pede o roteiro à IA, valida e corrige até `tentativas` vezes por modelo.
 * Devolve { episodio, modelo, tentativas } ou lança erro com o último problema.
 */
export async function escreverEpisodio(
  { tema, manchetes = [], formato, id, tituloIrmao, titulosUsados = [] },
  { token = process.env.GITHUB_TOKEN, modelos = modelosPadrao(), tentativas = 3, fetch: f = globalThis.fetch, log = console.log } = {},
) {
  if (!token && !modelos.every((m) => m.startsWith("ollama:"))) throw new Error("sem GITHUB_TOKEN para usar a IA gratuita do GitHub Models");
  let ultimo = "nenhuma resposta";
  for (const modelo of modelos) {
    const inicio = [
      { role: "system", content: sistema(formato) },
      { role: "user", content: pedido({ tema, manchetes, formato, tituloIrmao, titulosUsados }) },
    ];
    // O plano gratuito aceita ~8 mil tokens de entrada: na correção vai só a última resposta.
    let mensagens = inicio;
    for (let n = 1; n <= tentativas; n++) {
      let texto;
      try {
        texto = await chamarIA(f, token, modelo, mensagens, formato);
      } catch (e) {
        if (e.fatal) throw e;
        ultimo = e.message;
        if (e.limite) {
          log(`  · ${ultimo}`);
          break; // tenta o próximo modelo
        }
        log(`  · tentativa ${n} (${modelo}): ${ultimo}`);
        continue;
      }
      let problemas = [];
      let episodio;
      try {
        episodio = montarEpisodio(JSON.parse(texto.replace(/^```(json)?|```$/g, "").trim()), { id, formato });
        parseEpisode(episodio, `roteiro ${formato}`);
        problemas = problemasDeConteudo(episodio, formato, { titulosUsados });
      } catch (e) {
        problemas = [e.message];
      }
      if (!problemas.length) return { episodio: parseEpisode(episodio), bruto: episodio, modelo, tentativas: n };
      ultimo = problemas.join("; ");
      log(`  · tentativa ${n} (${modelo}) com problemas: ${ultimo.slice(0, 600)}`);
      mensagens = [
        ...inicio,
        { role: "assistant", content: texto.slice(0, 12000) },
        { role: "user", content: `Corrija estes problemas e devolva o JSON completo de novo:\n- ${problemas.join("\n- ")}` },
      ];
    }
  }
  throw new Error(`a IA não entregou um roteiro ${formato} válido: ${ultimo}`);
}
