export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// Visual claro (o Patrick pediu para sair do estilo escuro): papel creme, texto azul-marinho,
// verde e âmbar como cores de destaque.
export const C = {
  bg: "#FBF7EE",
  bg2: "#F1EADB",
  card: "#FFFFFF",
  panel: "rgba(255, 255, 255, 0.94)",
  line: "rgba(20, 36, 56, 0.07)",
  track: "rgba(20, 36, 56, 0.09)",
  shadow: "rgba(20, 36, 56, 0.14)",
  green: "#0FA05A",
  greenDeep: "#08703D",
  gold: "#E8A317",
  goldDeep: "#B86E00",
  red: "#E5484D",
  ink: "#16263B",
  muted: "#5E6E80",
  onAccent: "#FFFFFF",
} as const;

export const seriesColor = (c: string): string =>
  ({ green: C.green, gold: C.gold, red: C.red, white: C.ink })[c] ?? C.green;

export const GOLD_GRADIENT = `linear-gradient(180deg, #F7B733 0%, ${C.gold} 45%, ${C.goldDeep} 100%)`;
export const GREEN_GRADIENT = `linear-gradient(180deg, #34D07F 0%, ${C.green} 50%, ${C.greenDeep} 100%)`;
/** Brilho suave das cores de destaque (no fundo claro, sombra leve em vez de neon). */
export const glow = (cor: string, alfa = "33") => `0 10px 30px ${cor}${alfa}`;

export const fmtNumber = (v: number, decimals = 0): string =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
