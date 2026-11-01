// Números por extenso em português do Brasil, para a narração (a voz lê melhor
// "dez mil reais" do que "R$ 10.000"). Usado para corrigir o texto da IA.

const UNI = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n) {
  if (n < 20) return UNI[n];
  if (n < 100) return DEZ[Math.floor(n / 10)] + (n % 10 ? ` e ${UNI[n % 10]}` : "");
  if (n === 100) return "cem";
  return CEM[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : "");
}

const ESCALAS = [
  [1e12, "trilhão", "trilhões"],
  [1e9, "bilhão", "bilhões"],
  [1e6, "milhão", "milhões"],
];

/** Inteiro (até trilhões) por extenso: 2026 -> "dois mil e vinte e seis". */
export function inteiroPorExtenso(n) {
  n = Math.floor(Math.abs(n));
  if (n < 1000) return ate999(n);
  const grupos = []; // [valor do grupo, texto]
  let resto = n;
  for (const [v, sing, plur] of ESCALAS) {
    const q = Math.floor(resto / v);
    if (q) grupos.push([q * v, `${inteiroPorExtenso(q)} ${q === 1 ? sing : plur}`]);
    resto %= v;
  }
  const mil = Math.floor(resto / 1000);
  if (mil) grupos.push([mil * 1000, mil === 1 ? "mil" : `${ate999(mil)} mil`]);
  resto %= 1000;
  if (resto) grupos.push([resto, ate999(resto)]);
  // "mil e quinhentos", "dois mil e vinte", mas "mil duzentos e trinta".
  return grupos
    .map(([v, t], i) => {
      if (i === 0) return t;
      const redondo = v < 100 || (v < 1000 && v % 100 === 0) || (v >= 1000 && i === grupos.length - 1);
      return `${redondo ? " e " : " "}${t}`;
    })
    .join("");
}

/** "10.000" / "4,5" / "1.500,75" -> número. */
const lerNumero = (t) => Number(t.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));

function numeroPorExtenso(t) {
  const [int, dec] = t.replace(/\.(?=\d{3}(\D|$))/g, "").split(",");
  const base = inteiroPorExtenso(Number(int));
  if (!dec) return base;
  const d = dec.replace(/0+$/, "");
  if (!d) return base;
  return `${base} vírgula ${d.length <= 2 && !d.startsWith("0") ? inteiroPorExtenso(Number(d)) : [...d].map((c) => UNI[Number(c)]).join(" ")}`;
}

const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;

/** Troca algarismos e símbolos da narração por palavras. */
export function narracaoPorExtenso(texto) {
  let s = String(texto);
  // R$ 10.000 / R$10 mil / 10 mil reais
  s = s.replace(new RegExp(String.raw`R\$\s*(${NUM})(\s*(milhões|milhão|bilhões|bilhão|mil)(?![a-zà-ú]))?`, "g"), (_, n, _e, escala) => {
    const v = lerNumero(n);
    if (escala) {
      const palavras = numeroPorExtenso(n);
      if (/^mil$/i.test(escala)) return `${palavras === "um" ? "" : `${palavras} `}mil reais`;
      return `${palavras} ${escala} de reais`;
    }
    const inteiro = Math.floor(v);
    const centavos = Math.round((v - inteiro) * 100);
    const reais = inteiro ? `${inteiroPorExtenso(inteiro)} ${inteiro === 1 ? "real" : "reais"}` : "";
    const cents = centavos ? `${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}` : "";
    return [reais, cents].filter(Boolean).join(" e ") || "zero reais";
  });
  s = s.replace(new RegExp(String.raw`(${NUM})\s*%`, "g"), (_, n) => `${numeroPorExtenso(n)} por cento`);
  s = s.replace(/\b13\s*[ºo°]\s*(?=sal|\b)/gi, "décimo terceiro ");
  s = s.replace(new RegExp(NUM, "g"), (n) => numeroPorExtenso(n));
  s = s.replace(/\bR\$\s*/g, "reais ").replace(/%/g, " por cento").replace(/\$/g, "");
  return s.replace(/\s{2,}/g, " ").trim();
}
