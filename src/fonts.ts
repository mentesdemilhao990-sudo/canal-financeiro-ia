import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const DISPLAY = "'Bebas Neue', 'DejaVu Sans', sans-serif";
export const BODY = "'Montserrat', 'DejaVu Sans', sans-serif";

const faces: [string, string, string][] = [
  ["Bebas Neue", "bebas-neue-latin-400-normal.woff2", "400"],
  ["Montserrat", "montserrat-latin-500-normal.woff2", "500"],
  ["Montserrat", "montserrat-latin-700-normal.woff2", "700"],
  ["Montserrat", "montserrat-latin-800-normal.woff2", "800"],
  ["Montserrat", "montserrat-latin-900-normal.woff2", "900"],
];

let loaded = false;
export const ensureFonts = () => {
  if (loaded) return;
  loaded = true;
  for (const [family, file, weight] of faces) {
    loadFont({ family, url: staticFile(`fonts/${file}`), weight, format: "woff2" });
  }
};
