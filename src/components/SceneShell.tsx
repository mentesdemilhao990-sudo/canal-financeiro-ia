import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { PALCO_H, useHorizontal } from "./Landscape";

/** Jeitos de a cena entrar; cada cena usa um diferente para o vídeo não ficar repetitivo. */
const ENTRADAS = ["subir", "direita", "zoom", "esquerda"] as const;

/**
 * Entrada e saída de cada cena (variando por cena), uma faixa colorida de transição
 * e um movimento de câmera lento e contínuo para a tela nunca ficar parada.
 */
export const SceneShell: React.FC<{ duration: number; index?: number; children: React.ReactNode }> = ({ duration, index = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 110 } });
  const exit = interpolate(frame, [duration - 10, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sweep = interpolate(frame, [0, 18], [-0.2, 1.2], { extrapolateRight: "clamp" });
  const tipo = ENTRADAS[index % ENTRADAS.length];
  const a = 1 - enter;
  const entrada =
    tipo === "direita" ? `translateX(${a * 160}px)` : tipo === "esquerda" ? `translateX(${a * -160}px)` : tipo === "zoom" ? `scale(${1 + a * 0.18})` : `translateY(${a * 70}px)`;
  // câmera: aproxima devagar ao longo da cena e balança de leve
  const zoom = interpolate(frame, [0, Math.max(1, duration)], [1, 1.035], { extrapolateRight: "clamp" });
  const balanco = `translate(${Math.sin(frame / 70) * 6}px, ${Math.cos(frame / 85) * 5}px)`;
  const cor = index % 2 ? C.green : C.gold;
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: Math.min(enter, exit),
          transform: `${entrada} ${balanco} scale(${zoom * (0.97 + enter * 0.03)}) translateY(${(1 - exit) * -40}px)`,
          filter: `blur(${(1 - Math.min(enter, exit)) * 8}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
      {frame < 20 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 90,
            left: sweep * width,
            transform: "skewX(-12deg)",
            background: `linear-gradient(90deg, transparent, ${cor}55, transparent)`,
            opacity: 0.9,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

/** Área útil da cena (evita o topo com o nome do canal e a faixa da legenda). */
export const Stage: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  const horizontal = useHorizontal();
  const area = horizontal ? PALCO_H : { top: 190, left: 70, right: 70, height: 1150 };
  return (
  <div
    style={{
      position: "absolute",
      ...area,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      ...style,
    }}
  >
    {children}
  </div>
  );
};
