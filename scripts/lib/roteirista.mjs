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
  const locais = env.OLLAMA_MODELO ? [`ollama:${env.OLLAMA_MODELO}`] : ["openai/gpt-4.1", "openai/gpt-4o-mini"];
  // Com a chave grátis do Gemini, ele escreve primeiro (bem melhor e mais rápido); a IA local fica de reserva.
  // O Google aposenta modelos sem aviso (o 2.5 Flash saiu em 2026-11): tenta o atual e depois o apelido "latest".
  const gemini = env.GEMINI_MODELO_TEXTO ? [env.GEMINI_MODELO_TEXTO] : ["gemini-3.8-flash", "gemini-flash-latest"];
  return env.GEMINI_API_KEY?.trim() ? [...gemini.map((m) => `gemini:${m}`), ...locais] : locais;
}

/** Metas de tamanho por formato (a voz calma do Gemini fala ~13 caracteres por segundo, mais as pausas). */
export const METAS = {
  // caracteres: meta pedida à IA; aceite: duração estimada que ainda aprovamos (a IA nem sempre acerta o tamanho).
  short: { cenas: [5, 7], caracteres: [480, 640], duracao: [36, 58], aceite: [32, 59], cta: "Siga para mais", porCena: 380, minCena: 110 },
  // O longo tem no mínimo 8 minutos (pedido do Patrick) e é escrito em partes de ~3 minutos:
  // começo, meio e fim; se as partes vierem curtas, entram mais partes de meio (até maxPartes).
  longo: { cenas: [15, 44], caracteres: [6800, 8600], duracao: [480, 660], aceite: [480, 900], cta: "Inscreva-se", porCena: 650, minCena: 260, partes: 3, maxPartes: 5 },
  // Cada parte do longo (só usado na escrita; o vídeo final é validado como "longo").
  // A parte aceita até 60% do tamanho pedido: o que faltar vira mais uma parte de meio.
  longoParte: { cenas: [5, 10], caracteres: [2300, 2900], minimo: 0.6, cta: "Inscreva-se", porCena: 650, minCena: 260 },
};

/** O que cada parte do vídeo longo cobre (a IA recebe o plano inteiro para não repetir assunto). */
const PLANO_DO_LONGO = [
  "PARTE 1 (começo): gancho forte, por que isso importa agora, o problema explicado com um caso concreto (personagem com nome e números redondos) e uma curiosidade em aberto para segurar a pessoa até o fim.",
  "PARTE 2 (meio): a explicação passo a passo, com contas acontecendo na tela (gráfico, barras ou número animado), comparações e exemplos do dia a dia. Responda a curiosidade da parte 1 só no fim desta parte.",
  "PARTE 3 (final): os erros mais comuns, um plano prático em passos simples, um resumo rápido do vídeo, uma pergunta para os comentários e o fechamento.",
];

/** Papel da parte no plano: 0 = começo, 1 = meio (pode haver mais de uma), 2 = final. */
const papel = (parte) => parte.papel ?? (parte.i === 0 ? 0 : parte.i === parte.n - 1 ? 2 : 1);

export const AVISO = "Conteúdo educativo. Valores ilustrativos, não é recomendação de investimento.";

/** Duração estimada da narração, em segundos (calibrada com a voz Orus do Gemini a 0,9x: Short de 858 caracteres = 71 s). */
export function estimarDuracao(scenes) {
  const chars = scenes.reduce((n, s) => n + s.narration.length, 0);
  const frases = scenes.reduce((n, s) => n + (s.narration.match(/[^.!?…]+[.!?…]*/g) ?? []).filter((f) => f.trim()).length, 0);
  return chars / 13 + frases * 0.22 + scenes.length * 0.4 + 0.8;
}

const MARCAS = [
  "nubank", "itau", "bradesco", "santander", "banco do brasil", "btg", "xp investimentos", "clear corretora", "banco inter", "c6 bank",
  "picpay", "mercado pago", "pagbank", "binance", "avenue", "nomad", "modalmais", "warren", "toro investimentos",
];
const PROMESSAS = [/\bgarantid[oa]s?\b/, /\blucro certo\b/, /\bsem risco\b/, /\bfique rico\b/, /\brenda garantida\b/, /\bcompre (agora|j[aá])\b/, /\binvista (agora|j[aá])\b/];

/** Regras extras além do formato: segurança do conteúdo e leitura pela voz. */
export function problemasDeConteudo(ep, formato, { titulosUsados = [], parte } = {}) {
  const p = [];
  const meta = METAS[parte ? "longoParte" : formato];
  const primeira = !parte || papel(parte) === 0;
  const ultima = !parte || papel(parte) === 2;
  const todo = semAcento([ep.title, ep.description, ...ep.scenes.map((s) => `${s.narration} ${JSON.stringify(s.data)}`)].join(" ").toLowerCase());
  for (const m of MARCAS) if (new RegExp(`(^|[^a-z])${semAcento(m)}([^a-z]|$)`).test(todo)) p.push(`não cite marcas, bancos ou corretoras (apareceu "${m}")`);
  // "Não existe retorno garantido" é um alerta, não uma promessa: frases negadas não contam.
  const semNegadas = todo.replace(/\b(nao|nada|nunca|nenhuma?|jamais)\b[^.!?]{0,40}?\b(garantid[oa]s?|sem risco|lucro certo)\b/g, " ");
  for (const r of PROMESSAS) if (r.test(semNegadas)) p.push(`não prometa resultado (apareceu algo como ${r.source.replace(/\\b/g, "")})`);
  if (/https?:|www\.|@\w/.test(todo)) p.push("sem links nem @menções");
  ep.scenes.forEach((s, i) => {
    if (/\d/.test(s.narration)) p.push(`cena ${i + 1}: escreva os números por extenso na narração (ex.: "dez mil reais"), sem algarismos`);
    if (/[%$€]|R\$/.test(s.narration)) p.push(`cena ${i + 1}: na narração escreva "por cento" e "reais", sem símbolos`);
    if (CAMPOS_NA_FALA.test(s.narration) || /[{}\[\]"]/.test(s.narration) || EMOJI.test(s.narration))
      p.push(`cena ${i + 1}: a narração é só o que a voz fala; não coloque nomes de campos (Título:, Legenda:...), chaves, aspas nem emojis`);
    EMOJI.lastIndex = 0;
    if (s.narration.length > meta.porCena) p.push(`cena ${i + 1}: narração com ${s.narration.length} caracteres; o máximo é ${meta.porCena}`);
    // Pedido de inscrição só uma vez, no fechamento, e de forma natural (o Patrick achou que tinha "inscreva-se" demais).
    const fechamento = ultima && i === ep.scenes.length - 1;
    if (!fechamento && /inscrev/i.test(s.narration)) p.push(`cena ${i + 1}: não peça inscrição aqui; o convite para se inscrever aparece uma vez só, na última cena`);
    if (s.template === "outro" && /inscrev/i.test(`${s.data?.title ?? ""} ${(s.data?.points ?? []).join(" ")}`))
      p.push(`cena ${i + 1}: o título e os pontos do fechamento resumem o vídeo; não escreva "inscreva-se" neles (o botão já mostra)`);
  });
  if (ultima && ep.scenes.length) {
    const vezes = (ep.scenes.at(-1).narration.match(/inscrev/gi) ?? []).length;
    if (vezes > 1) p.push("na última cena, convide para se inscrever uma vez só, de um jeito natural");
  }
  const falas = ep.scenes.map((s) => chaveFala(s.narration));
  falas.forEach((f, i) => {
    if (f && falas.indexOf(f) !== i) p.push(`cena ${i + 1}: repete a fala da cena ${falas.indexOf(f) + 1}; cada cena precisa de fala nova`);
  });
  const n = ep.scenes.length;
  if (n < meta.cenas[0] || n > meta.cenas[1]) p.push(`use de ${meta.cenas[0]} a ${meta.cenas[1]} cenas (vieram ${n})`);
  if (primeira && /^\s*(bom dia|boa tarde|boa noite|ol[aá]|oi|e a[ií]|hoje (vamos|eu vou|vou)|neste v[ií]deo)\b/i.test(ep.scenes[0]?.narration ?? ""))
    p.push('cena 1: não abra com saudação ou "hoje vamos falar"; comece com um fato surpreendente, uma conta ou uma pergunta forte');
  if (primeira && ep.scenes[0]?.template !== "hook") p.push('a primeira cena precisa ser "hook"');
  if (!primeira && ep.scenes.some((s) => s.template === "hook")) p.push('só a parte 1 tem cena "hook"; continue o vídeo com os outros modelos de cena');
  if (ultima && ep.scenes.at(-1)?.template !== "outro") p.push('a última cena precisa ser "outro"');
  if (!ultima && ep.scenes.some((s) => s.template === "outro")) p.push('não use "outro" nesta parte: o vídeo continua na próxima');
  const chars = ep.scenes.reduce((t, s) => t + s.narration.length, 0);
  const fora = chars < meta.caracteres[0] ? "curta" : chars > meta.caracteres[1] ? "longa" : null;
  const d = estimarDuracao(ep.scenes);
  // A parte é medida em caracteres (com folga); o vídeo inteiro, pela duração estimada.
  const tamanhoRuim = meta.aceite ? d < meta.aceite[0] || d > meta.aceite[1] : chars < meta.caracteres[0] * (meta.minimo ?? 0.97) || chars > meta.caracteres[1] * 1.15;
  if (tamanhoRuim)
    p.push(`a narração somada tem ${chars} caracteres (${fora ?? "fora do tamanho"}): precisa ficar entre ${meta.caracteres[0]} e ${meta.caracteres[1]}`);
  const t = semAcento(ep.title).toLowerCase().trim();
  if (primeira && titulosUsados.some((u) => semAcento(u).toLowerCase().trim() === t)) p.push("esse título já foi usado no canal; crie outro");
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

function sistema(formato, parte) {
  const m = METAS[parte ? "longoParte" : formato];
  const L = METAS.longo;
  const tipo =
    formato === "short"
      ? `um YouTube Short vertical de ${m.duracao[0]} a ${m.duracao[1]} segundos: direto ao ponto, gancho forte nos 3 primeiros segundos, uma ideia central`
      : `a PARTE ${parte.i + 1} de ${parte.n} de um vídeo normal do YouTube (horizontal) de ${Math.round(L.duracao[0] / 60)} a ${Math.round(L.duracao[1] / 60)} minutos: uma aula completa e envolvente, com contexto, explicação passo a passo, exemplos com contas, erros comuns e resumo final.
Plano do vídeo inteiro (escreva SÓ a sua parte, continuando de onde a anterior parou, sem repetir o que já foi dito):
${PLANO_DO_LONGO.map((x, k) => `${k === papel(parte) ? "→ " : "  "}${x}`).join("\n")}${papel(parte) === 1 && parte.i > 1 ? "\nEsta é uma parte extra do MEIO: aprofunde com um caso novo, outra conta ou outro ângulo que ainda não apareceu." : ""}`;
  const estrutura = !parte
    ? `- De ${m.cenas[0]} a ${m.cenas[1]} cenas. A primeira é "hook" e a última é "outro" com "cta": "${m.cta}".`
    : `- De ${m.cenas[0]} a ${m.cenas[1]} cenas nesta parte.${papel(parte) === 0 ? ' A primeira cena é "hook".' : ' NÃO use "hook" (o vídeo já começou).'}${papel(parte) === 2 ? ` A última cena é "outro" com "cta": "${m.cta}".` : ' NÃO use "outro" (o vídeo continua na próxima parte).'}`;
  return `Você é roteirista do canal "Mente de Milhão", de educação financeira para brasileiros comuns, em português do Brasil.
Escreva ${tipo}.

Regras de conteúdo (obrigatórias):
- Educativo e responsável. NUNCA recomende produto, banco, corretora, fundo, ação ou cripto específicos. NUNCA prometa rentabilidade ou enriquecimento.
- Use números como exemplos ilustrativos e deixe claro que são exemplos. Não afirme valores atuais de Selic, IPCA, dólar, salário mínimo ou outras taxas, a não ser que o número esteja nas manchetes fornecidas; nesse caso diga "segundo as notícias desta semana".
- Contas precisam estar certas (juros, porcentagens, somas). Prefira números redondos.
- Linguagem simples, tom de conversa, sem jargão sem explicar. Nada de "eu sou uma IA".
- Sem links, sem @, sem pedir dados pessoais.

Estilo (aprendido com os vídeos mais vistos dos grandes canais de finanças do Brasil; imite o JEITO, nunca o conteúdo):
- Fale como uma pessoa de verdade, um amigo que entende de dinheiro conversando com "você", NUNCA como locutor ou robô: use o jeito falado do brasileiro ("pra", "tá", "né", "olha só", "sabe aquele...?", "pensa comigo"), misture frases curtas e médias, faça perguntas retóricas ("Sabe por quê?", "Parece pouco, né?"), dê opinião clara e mostre surpresa ou indignação quando cabe ("Só eu acho isso absurdo?").
- Ligue uma cena à outra como numa conversa ("e aí vem a parte que ninguém te conta", "agora repara numa coisa"), em vez de começar cada cena do zero.
- Evite frases de efeito repetidas, listas recitadas e palavras de anúncio ("incrível", "imperdível", "não perca").
- Abertura (gancho) nos primeiros segundos: comece com um fato surpreendente, uma conta que choca ou uma contradição do dia a dia, e prometa o que a pessoa vai ganhar assistindo até o fim. PROIBIDO abrir com "Bom dia", "Olá", "Hoje vamos falar sobre" ou "Neste vídeo".
- Use um caso concreto com personagem e números redondos ("Imagina a Ana, que ganha três mil reais por mês...") e mostre a conta acontecendo.
- Deixe uma curiosidade em aberto e só responda mais à frente ("e o terceiro erro é o mais caro de todos").
- Termine com uma frase de efeito e uma pergunta para os comentários ("Comenta aí: você faria isso?").
- Convite para se inscrever: UMA vez só, na última cena, curto e natural, como um amigo falaria ("se isso te ajudou, se inscreve aí que toda semana tem mais"). Nunca peça inscrição no meio do vídeo, nem no título ou nos pontos do fechamento.
- Título no estilo dos grandes canais: promessa concreta com número ou contraste, e no máximo duas palavras-chave em MAIÚSCULAS. Ex. de formato: "Como sair das DÍVIDAS em 12 meses ganhando pouco", "Por que 9 em cada 10 pessoas nunca juntam dinheiro?". Nada de título genérico ou "Onde colocar seu dinheiro?".

Regras da narração (lida por uma voz sintética):
- Números SEMPRE por extenso e sem símbolos: "dez mil reais", "quatro e meio por cento". Nada de algarismos, %, R$.
- Cada cena tem no máximo ${m.porCena} caracteres de narração. A narração somada de todas as cenas fica entre ${m.caracteres[0]} e ${m.caracteres[1]} caracteres.
- Nos campos visuais ("data") use algarismos e símbolos normalmente: "R$ 10.000", "4,5%".
- "narration" é SÓ o texto que a voz fala, como um apresentador conversando. NUNCA coloque nela nomes de campos (Título:, Legenda:, Prefixo:, Itens:, Data:), chaves, colchetes, aspas ou emojis. O que vai na tela fica só em "data".
- Cada cena traz uma informação nova. Nunca repita a fala de outra cena.

Estrutura:
${estrutura}
- Varie os modelos de cena e use pelo menos um gráfico ou número animado ("counter", "lineChart" ou "bars") com valores coerentes com a narração.
- Cada cena tem "id" único (letras minúsculas, números e hífen), "template", "narration" e "data".

${MODELOS_DE_CENA}

Responda SÓ com um objeto JSON neste formato:
{ "title": "título chamativo e honesto, até 90 caracteres", "description": "2 a 3 frases para a descrição do YouTube, até 450 caracteres", "tags": ["5 a 10 tags curtas em português"], "scenes": [ ... ] }`;
}

function pedido({ tema, manchetes, formato, tituloIrmao, titulosUsados, anteriores = [] }) {
  const ja = anteriores.flatMap((a) => a.scenes);
  const linhas = [
    `Tema do dia: ${tema.nome}.`,
    `Abordagem sugerida: ${tema.angulo}.`,
    manchetes?.length ? `Manchetes recentes sobre o assunto (use só como contexto do que está em alta; não invente detalhes além delas):\n${manchetes.map((m) => `- ${m}`).join("\n")}` : "Sem manchetes hoje: faça um conteúdo atemporal sobre o tema.",
    tituloIrmao ? `Hoje também sai ${formato === "short" ? "um vídeo longo" : "um Short"} sobre o mesmo tema com o título "${tituloIrmao}". Use outro título e outro gancho.` : "",
    titulosUsados?.length ? `Títulos já usados no canal (não repita):\n${titulosUsados.slice(-30).map((t) => `- ${t}`).join("\n")}` : "",
    ja.length
      ? `O vídeo se chama "${anteriores[0].title}". O que já foi dito nas partes anteriores (NÃO repita; continue a conversa):\n${ja.map((s) => `- ${s.narration.slice(0, 140)}${s.narration.length > 140 ? "..." : ""}`).join("\n")}\n\nÚltima fala, para continuar daqui: "${ja.at(-1).narration}"\n\nNesta parte, "title", "description" e "tags" podem repetir os da parte 1.`
      : "",
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
/** Gemini pela interface compatível com OpenAI (plano grátis do Google AI Studio). */
async function chamarGemini(f, modelo, messages, espera = Number(process.env.GEMINI_ESPERA_503_MS ?? 30000)) {
  const chave = process.env.GEMINI_API_KEY?.trim();
  let r;
  // 503 = servidor do Google lotado (passa em minutos): espera e tenta de novo antes de desistir.
  for (let i = 0; i < 4; i++) {
    r = await f("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${chave}`, "content-type": "application/json" },
      body: JSON.stringify({ model: modelo.replace(/^gemini:/, ""), temperature: 0.8, response_format: { type: "json_object" }, messages }),
    });
    if (r.status !== 503 || i === 3) break;
    await new Promise((ok) => setTimeout(ok, espera * (i + 1)));
  }
  const bruto = await r.text();
  let j = {};
  try {
    j = JSON.parse(bruto);
  } catch {}
  const msg = (Array.isArray(j) ? j[0] : j)?.error?.message ?? bruto.slice(0, 300);
  if (r.status === 429) throw Object.assign(new Error(`${modelo}: limite gratuito atingido (HTTP 429) ${msg.slice(0, 160)}`), { limite: true, porMinuto: !/per ?day|PerDay|diári/i.test(msg) });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`${modelo}: chave sem permissão (HTTP ${r.status}) ${msg}`), { limite: true });
  // 404 = modelo aposentado ou inexistente: não adianta repetir, passa para o próximo.
  if (r.status === 404) throw Object.assign(new Error(`${modelo}: modelo indisponível (HTTP 404) ${msg}`), { limite: true });
  if (!r.ok) throw new Error(`${modelo}: HTTP ${r.status} ${msg}`);
  const texto = j.choices?.[0]?.message?.content ?? "";
  if (!texto.trim()) throw new Error(`${modelo}: resposta vazia`);
  return texto;
}

async function chamarIA(f, token, modelo, messages, formato) {
  if (modelo.startsWith("ollama:")) return chamarOllama(f, modelo, messages, formato);
  if (modelo.startsWith("gemini:")) return chamarGemini(f, modelo, messages);
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

// Nomes de campos visuais que a IA às vezes copia para dentro da fala
// ("Título: ...", "Prefixo: reais", "data: {"). A voz leria isso em voz alta.
const CAMPOS_NA_FALA =
  /(^|[\s.!?,;/])(t[ií]tulo|subt[ií]tulo|kicker|prefixo|sufixo|prefix|suffix|legenda|caption|badge|itens|items|pontos|points|[ií]cone|icon|tend[eê]ncia|trend|decimais|decimals|cta|data|label|value|values|series|lado (esquerdo|direito)|xlabels|valueprefix|valuesuffix)\s*:/i;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/** Limpa a fala: corta tudo a partir do primeiro nome de campo, tira emojis, chaves e aspas. */
export function limparNarracao(texto) {
  let t = String(texto ?? "");
  const m = t.match(CAMPOS_NA_FALA);
  if (m) t = t.slice(0, m.index + m[1].length);
  t = t
    .replace(EMOJI, "")
    .replace(/[{}\[\]"<>|*_#`]/g, " ")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/([.!?])(?:\s*[.!?,;:])+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[,;:/\s-]+$/, "");
  // Frases repetidas dentro da mesma fala saem.
  const vistas = new Set();
  t = (t.match(/[^.!?…]+[.!?…]*/g) ?? [])
    .filter((f) => {
      const k = semAcento(f).toLowerCase().replace(/[^a-z ]/g, "").trim();
      if (!k) return false;
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    })
    .map((f) => f.trim())
    .join(" ");
  if (t && !/[.!?…]$/.test(t)) t += ".";
  return t;
}

/** Chave para achar falas repetidas (ignora acento, pontuação e maiúsculas). */
const chaveFala = (t) => semAcento(String(t ?? "")).toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** Monta o episódio final a partir da resposta da IA (id, formato, aviso e meta de duração são nossos). */
export function montarEpisodio(bruto, { id, formato, semFechamento = false }) {
  // Cenas repetidas (mesma fala) saem: a IA local às vezes repete o roteiro inteiro para encher.
  const falas = new Set();
  const scenes = (Array.isArray(bruto?.scenes) ? bruto.scenes : [])
    .map((s) => (typeof s?.narration === "string" ? { ...s, narration: limparNarracao(s.narration) } : s))
    .filter((s) => {
      if (typeof s?.narration !== "string") return true;
      const k = chaveFala(s.narration);
      if (!k || falas.has(k)) return false;
      falas.add(k);
      return true;
    });
  const vistos = new Set();
  const cenas = scenes.map((s, i) => {
    let sid = String(s?.id ?? `cena-${i + 1}`).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `cena-${i + 1}`;
    while (vistos.has(sid)) sid = `${sid}-${i + 1}`;
    vistos.add(sid);
    // A IA às vezes escreve "R$ 10.000" ou "4,5%" na narração: vira texto falado.
    return { ...s, id: sid, ...(typeof s?.narration === "string" ? { narration: narracaoPorExtenso(s.narration) } : {}) };
  });
  // A IA às vezes esquece a cena de fechamento: colocamos uma padrão (ou trocamos a última, se já tem cenas demais).
  if (!semFechamento && cenas.length && cenas.at(-1)?.template !== "outro") {
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
            : "Se esse vídeo te ajudou, se inscreve aí e manda pra alguém que também quer organizar as finanças. A gente se vê no próximo!",
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
 * Conserta sozinho o que a IA local erra muito nas partes e no Short: tira pedidos de
 * inscrição fora da última cena, "hook" fora do começo e "outro" fora do final.
 */
export function consertarParte(ep, parte) {
  const primeira = !parte || papel(parte) === 0;
  const ultima = !parte || papel(parte) === 2;
  const semInscricao = (t) => (t.match(/[^.!?…]+[.!?…]*/g) ?? [t]).filter((f) => !/inscrev/i.test(f)).join(" ").trim();
  if (!ultima) ep.scenes = ep.scenes.filter((s) => s.template !== "outro");
  ep.scenes = ep.scenes.map((s, i) => {
    let c = s;
    if (!primeira && c.template === "hook") {
      const d = c.data ?? {};
      const itens = [d.kicker, d.subtitle].filter(Boolean).map((x) => String(x).slice(0, 50));
      while (itens.length < 2) itens.push(String(d.title ?? ep.title ?? "Resumo").slice(0, 50));
      c = { ...c, template: "list", data: { title: String(d.title ?? "Repara nisso").slice(0, 50), items: itens } };
    }
    const fechamento = ultima && i === ep.scenes.length - 1;
    if (!fechamento && /inscrev/i.test(c.narration ?? "")) c = { ...c, narration: semInscricao(c.narration) };
    if (c.template === "outro" && c.data) {
      const pontos = (c.data.points ?? []).filter((x) => !/inscrev/i.test(x));
      const titulo = /inscrev/i.test(c.data.title ?? "") ? String(ep.title ?? "Até o próximo vídeo").slice(0, 80) : c.data.title;
      c = { ...c, data: { ...c.data, title: titulo, points: pontos } };
    }
    return c;
  });
  // Cenas que ficaram vazias depois da limpeza saem.
  ep.scenes = ep.scenes.filter((s) => typeof s.narration !== "string" || s.narration.length >= 10);
  return ep;
}

/**
 * Pede o roteiro à IA, valida e corrige até `tentativas` vezes por modelo.
 * O vídeo longo é escrito em partes (cada uma validada) e depois validado inteiro.
 * Devolve { episodio, modelo, tentativas } ou lança erro com o último problema.
 */
export async function escreverEpisodio(pedidoDoDia, opcoes = {}) {
  const { formato, id, titulosUsados = [] } = pedidoDoDia;
  const log = opcoes.log ?? console.log;
  if (formato !== "longo") return escreverTrecho(pedidoDoDia, opcoes);
  const L = METAS.longo;
  const partes = [];
  const tamanho = () => partes.reduce((t, p) => t + p.bruto.scenes.reduce((u, s) => u + s.narration.length, 0), 0);
  let n = L.partes;
  for (let i = 0; i < n; i++) {
    // Antes do final: se o que já temos mais uma parte média não chega ao mínimo, entra mais uma parte de meio.
    if (i === n - 1 && n < L.maxPartes && tamanho() + tamanho() / i < L.caracteres[0]) n++;
    const p = i === 0 ? 0 : i === n - 1 ? 2 : 1;
    log(`  parte ${i + 1}/${n}${p === 1 && i > 1 ? " (extra, para chegar aos 8 minutos)" : ""}`);
    partes.push(await escreverTrecho({ ...pedidoDoDia, parte: { i, n, papel: p }, anteriores: partes.map((x) => x.bruto) }, opcoes));
  }
  const [p1] = partes;
  const episodio = montarEpisodio(
    { title: p1.bruto.title, description: p1.bruto.description, tags: p1.bruto.tags, scenes: partes.flatMap((p) => p.bruto.scenes) },
    { id, formato },
  );
  const problemas = [...(() => {
    try {
      parseEpisode(episodio, "roteiro longo");
      return [];
    } catch (e) {
      return [e.message];
    }
  })(), ...problemasDeConteudo(episodio, formato, { titulosUsados })];
  if (problemas.length) throw new Error(`a IA não entregou um roteiro longo válido: ${problemas.join("; ")}`);
  const modelos = [...new Set(partes.map((p) => p.modelo))].join(" + ");
  return { episodio: parseEpisode(episodio), bruto: episodio, modelo: modelos, tentativas: partes.reduce((t, p) => t + p.tentativas, 0) };
}

/** Um roteiro inteiro (Short) ou uma parte do longo. */
async function escreverTrecho(
  { tema, manchetes = [], formato, id, tituloIrmao, titulosUsados = [], parte, anteriores = [] },
  { token = process.env.GITHUB_TOKEN, modelos = modelosPadrao(), tentativas = 3, fetch: f = globalThis.fetch, log = console.log } = {},
) {
  if (!token && !modelos.every((m) => /^(ollama|gemini):/.test(m))) throw new Error("sem GITHUB_TOKEN para usar a IA gratuita do GitHub Models");
  const formatoIA = parte ? "longoParte" : formato;
  const semFechamento = Boolean(parte && papel(parte) !== 2);
  let ultimo = "nenhuma resposta";
  const esperouLimite = new Set();
  for (const modelo of modelos) {
    const inicio = [
      { role: "system", content: sistema(formato, parte) },
      { role: "user", content: pedido({ tema, manchetes, formato, tituloIrmao, titulosUsados, anteriores }) },
    ];
    // O plano gratuito aceita ~8 mil tokens de entrada: na correção vai só a última resposta.
    let mensagens = inicio;
    for (let n = 1; n <= tentativas; n++) {
      let texto;
      try {
        texto = await chamarIA(f, token, modelo, mensagens, formatoIA);
      } catch (e) {
        if (e.fatal) throw e;
        ultimo = e.message;
        if (e.limite) {
          log(`  · ${ultimo}`);
          // Limite por minuto passa rápido: espera um minuto e tenta de novo uma vez.
          if (e.porMinuto && !esperouLimite.has(modelo)) {
            esperouLimite.add(modelo);
            await new Promise((ok) => setTimeout(ok, Number(process.env.GEMINI_ESPERA_429_MS ?? 65000)));
            n--;
            continue;
          }
          break; // tenta o próximo modelo
        }
        log(`  · tentativa ${n} (${modelo}): ${ultimo}`);
        continue;
      }
      let problemas = [];
      let episodio;
      try {
        episodio = montarEpisodio(JSON.parse(texto.replace(/^```(json)?|```$/g, "").trim()), { id, formato, semFechamento });
        // Fala que repete uma parte anterior sai (a IA às vezes recomeça o vídeo).
        if (anteriores.length) {
          const ja = new Set(anteriores.flatMap((a) => a.scenes.map((s) => chaveFala(s.narration))));
          episodio.scenes = episodio.scenes.filter((s) => !ja.has(chaveFala(s.narration)));
        }
        consertarParte(episodio, parte);
        parseEpisode(episodio, `roteiro ${formato}`);
        problemas = problemasDeConteudo(episodio, formato, { titulosUsados, parte });
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
  throw new Error(`a IA não entregou um roteiro ${parte ? `longo (parte ${parte.i + 1})` : formato} válido: ${ultimo}`);
}
