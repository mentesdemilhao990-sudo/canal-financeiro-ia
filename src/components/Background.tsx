import React, { useMemo } from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { BODY, DISPLAY } from "../fonts";
import { C } from "../theme";

const SIMBOLOS = ["R$", "%", "$", "+", "↑", "↓"];

/**
 * Fundo claro e vivo: papel creme com grade suave, velas de bolsa passando, manchas de cor
 * que se movem devagar e símbolos de dinheiro (R$, %, moedas, setas) flutuando para cima.
 */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const candles = useMemo(
    () =>
      new Array(Math.ceil(width / 48) + 2).fill(0).map((_, i) => {
        const base = height > width ? 1300 - i * 22 + Math.sin(i * 0.9) * 90 : height * 0.82 - i * 9 + Math.sin(i * 0.9) * 60;
        const body = 40 + random(`cb${i}`) * 110;
        return { x: i * 48, y: base - body / 2, body, wick: body + 30 + random(`cw${i}`) * 80, up: random(`cu${i}`) > 0.35 };
      }),
    [width, height],
  );

  const flutuantes = useMemo(
    () =>
      new Array(18).fill(0).map((_, i) => ({
        x: random(`fx${i}`) * width,
        y: random(`fy${i}`) * height,
        tamanho: 40 + random(`ft${i}`) * 70,
        velocidade: 0.4 + random(`fv${i}`) * 0.9,
        fase: random(`fp${i}`) * Math.PI * 2,
        giro: (random(`fg${i}`) - 0.5) * 0.6,
        tipo: Math.floor(random(`fk${i}`) * (SIMBOLOS.length + 2)),
        cor: random(`fc${i}`) > 0.5 ? C.green : C.gold,
      })),
    [width, height],
  );

  const drift = frame * 0.6;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 25%, #FFFFFF 0%, ${C.bg} 55%, ${C.bg2} 100%)` }}>
      {/* manchas de cor que passeiam devagar */}
      <AbsoluteFill
        style={{
          background: [
            `radial-gradient(35% 28% at ${22 + Math.sin(frame / 120) * 12}% ${30 + Math.cos(frame / 140) * 10}%, ${C.green}1F, transparent 70%)`,
            `radial-gradient(32% 26% at ${78 + Math.cos(frame / 130) * 10}% ${68 + Math.sin(frame / 110) * 10}%, ${C.gold}24, transparent 70%)`,
          ].join(", "),
        }}
      />
      {/* grade */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px)`,
          backgroundSize: "90px 90px",
          backgroundPosition: `0px ${drift % 90}px`,
          opacity: 0.9,
          maskImage: "radial-gradient(80% 60% at 50% 45%, black 30%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(80% 60% at 50% 45%, black 30%, transparent 85%)",
        }}
      />
      {/* velas ao fundo */}
      <svg width={width} height={height} style={{ position: "absolute", opacity: 0.07, transform: `translateX(${-(frame * 0.8) % 48}px)` }}>
        {candles.map((c, i) => (
          <g key={i}>
            <rect x={c.x + 20} y={c.y + c.body / 2 - c.wick / 2} width={3} height={c.wick} fill={c.up ? C.green : C.red} />
            <rect x={c.x + 8} y={c.y} width={27} height={c.body} rx={3} fill={c.up ? C.green : C.red} />
          </g>
        ))}
      </svg>
      {/* símbolos e moedas flutuando */}
      {flutuantes.map((f, i) => {
        const y = (((f.y - frame * f.velocidade) % (height + 200)) + height + 200) % (height + 200) - 100;
        const x = f.x + Math.sin(frame / 50 + f.fase) * 24;
        const pisca = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(frame / 35 + f.fase));
        const estilo: React.CSSProperties = {
          position: "absolute",
          left: x,
          top: y,
          opacity: pisca,
          transform: `rotate(${Math.sin(frame / 80 + f.fase) * 20 + frame * f.giro}deg)`,
        };
        if (f.tipo >= SIMBOLOS.length) {
          // moeda
          return (
            <div key={i} style={{ ...estilo, width: f.tamanho, height: f.tamanho, borderRadius: "50%", border: `${f.tamanho * 0.09}px solid ${f.cor}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: DISPLAY, fontSize: f.tamanho * 0.5, color: f.cor }}>$</span>
            </div>
          );
        }
        return (
          <span key={i} style={{ ...estilo, fontFamily: SIMBOLOS[f.tipo].length > 1 ? BODY : DISPLAY, fontWeight: 900, fontSize: f.tamanho, color: f.cor }}>
            {SIMBOLOS[f.tipo]}
          </span>
        );
      })}
      {/* vinheta bem leve */}
      <AbsoluteFill style={{ background: `radial-gradient(95% 75% at 50% 45%, transparent 60%, ${C.shadow} 100%)` }} />
    </AbsoluteFill>
  );
};
