export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const C = {
  bg: "#06080B",
  bg2: "#0B1015",
  panel: "rgba(16, 22, 28, 0.82)",
  line: "rgba(255, 255, 255, 0.08)",
  green: "#2BD97C",
  greenDeep: "#0E7A43",
  gold: "#F2C14E",
  goldDeep: "#B8860B",
  red: "#FF5A5F",
  white: "#F4F6F7",
  muted: "#8B97A3",
} as const;

export const seriesColor = (c: string): string =>
  ({ green: C.green, gold: C.gold, red: C.red, white: C.white })[c] ?? C.green;

export const GOLD_GRADIENT = `linear-gradient(180deg, #FFE7A3 0%, ${C.gold} 45%, ${C.goldDeep} 100%)`;
export const GREEN_GRADIENT = `linear-gradient(180deg, #9CF7C4 0%, ${C.green} 50%, ${C.greenDeep} 100%)`;

export const fmtNumber = (v: number, decimals = 0): string =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
