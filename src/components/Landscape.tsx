import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Episode } from "../types";
import { C } from "../theme";
import { BODY } from "../fonts";
import { useIn } from "../scenes/common";

// Vídeo longo (horizontal 1920x1080): a cena ocupa a tela inteira, sem dividir em
// colunas. As cenas são desenhadas numa tela "virtual" de 2400x1350 e reduzidas para
// 1920x1080, assim os tamanhos de letra continuam os mesmos do Short.

/** Tamanho da tela virtual das cenas horizontais. */
export const TELA = { w: 2400, h: 1350 };
/** Área útil das cenas na tela virtual (abaixo do nome do canal, acima da legenda). */
export const PALCO_H = { top: 120, left: 140, right: 140, height: 940 };

/** Verdadeiro quando o vídeo é horizontal (vídeo longo). */
export const useHorizontal = () => {
  const { width, height } = useVideoConfig();
  return width > height;
};

/** Desenha a cena na tela virtual e reduz para o tamanho do vídeo, com um zoom lento. */
export const PalcoHorizontal: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const s = width / TELA.w;
  const zoom = interpolate(frame, [0, Math.max(1, duration)], [1, 1.03], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: TELA.w,
        height: TELA.h,
        transformOrigin: "0 0",
        transform: `scale(${s}) translate(${TELA.w / 2}px, ${TELA.h * 0.45}px) scale(${zoom}) translate(${-TELA.w / 2}px, ${-TELA.h * 0.45}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** Selo discreto no canto: em que parte da aula a pessoa está. */
export const SeloParte: React.FC<{ episode: Episode; index: number }> = ({ episode, index }) => {
  const p = useIn(6);
  const total = episode.scenes.length;
  return (
    <div
      style={{
        position: "absolute",
        top: 30,
        left: 48,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 20px",
        borderRadius: 30,
        background: "rgba(255,255,255,0.85)",
        border: `1.5px solid ${C.line}`,
        boxShadow: `0 6px 18px ${C.shadow}`,
        opacity: p,
        transform: `translateX(${(1 - p) * -24}px)`,
        fontFamily: BODY,
        fontWeight: 800,
        fontSize: 20,
        letterSpacing: 3,
        color: C.green,
      }}
    >
      <span>PARTE {index + 1} DE {total}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {episode.scenes.map((_, i) => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: i < index ? C.green : i === index ? C.gold : C.track }} />
        ))}
      </div>
    </div>
  );
};
