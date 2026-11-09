import React, { useMemo } from "react";
import { interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Episode } from "../types";
import { C, GOLD_GRADIENT } from "../theme";
import { BODY, DISPLAY } from "../fonts";

// Elementos extras do vídeo longo (horizontal) para a tela ficar mais moderna e viva:
// número gigante da parte ao fundo, cartões flutuando nos cantos, cantoneiras,
// transição colorida entre cenas e uma faixa de palavras-chave correndo embaixo.

const useEntrada = (delay = 0, config = { damping: 16, stiffness: 110 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

/** Número enorme e vazado da parte atual, atrás do conteúdo. */
export const NumeroGigante: React.FC<{ index: number; duration: number }> = ({ index, duration }) => {
  const frame = useCurrentFrame();
  const p = useEntrada(0, { damping: 22, stiffness: 70 });
  const lado = index % 2 === 0 ? { right: 30 } : { left: 30 };
  const deriva = interpolate(frame, [0, Math.max(1, duration)], [0, index % 2 === 0 ? -50 : 50]);
  return (
    <div
      style={{
        position: "absolute",
        top: 70,
        ...lado,
        fontFamily: DISPLAY,
        fontSize: 620,
        lineHeight: 1,
        color: "transparent",
        WebkitTextStroke: `3px ${index % 2 === 0 ? C.gold : C.green}`,
        opacity: 0.16 * p,
        transform: `translateX(${(1 - p) * (index % 2 === 0 ? 200 : -200) + deriva}px)`,
      }}
    >
      {String(index + 1).padStart(2, "0")}
    </div>
  );
};

/** Cantoneiras nos quatro cantos que se abrem a cada cena. */
export const Cantoneiras: React.FC = () => {
  const p = useEntrada(4);
  const { width, height } = useVideoConfig();
  const t = 46 * p;
  const m = 26;
  const cor = `${C.gold}AA`;
  const base: React.CSSProperties = { position: "absolute", width: t, height: t, borderColor: cor, borderStyle: "solid", borderWidth: 0 };
  return (
    <>
      <div style={{ ...base, left: m, top: m + 60, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 10 }} />
      <div style={{ ...base, left: width - m - t, top: m + 60, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 10 }} />
      <div style={{ ...base, left: m, top: height - m - t - 50, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 10 }} />
      <div style={{ ...base, left: width - m - t, top: height - m - t - 50, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 10 }} />
    </>
  );
};

const Vidro: React.FC<{ children: React.ReactNode; style: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      position: "absolute",
      padding: "16px 20px",
      borderRadius: 22,
      background: "rgba(255,255,255,0.72)",
      border: "1.5px solid rgba(255,255,255,0.9)",
      boxShadow: `0 18px 40px ${C.shadow}`,
      backdropFilter: "blur(6px)",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Mini gráfico que se desenha sozinho. */
const MiniGrafico: React.FC<{ seed: string; cor: string; k: number }> = ({ seed, cor, k }) => {
  const pts = useMemo(() => {
    let v = 50;
    return new Array(12).fill(0).map((_, i) => {
      v = Math.max(10, Math.min(90, v + (random(`${seed}${i}`) - 0.38) * 26));
      return v;
    });
  }, [seed]);
  const W = 150;
  const H = 56;
  const linha = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - (v / 100) * H}`).join(" ");
  return (
    <svg width={W} height={H}>
      <defs>
        <clipPath id={`mg${seed}`}>
          <rect x={0} y={0} width={W * k} height={H} />
        </clipPath>
      </defs>
      <polyline points={linha} fill="none" stroke={cor} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#mg${seed})`} />
    </svg>
  );
};

/** Cartões de vidro flutuando nos cantos livres da tela (mudam a cada cena). */
export const CartoesFlutuantes: React.FC<{ index: number; total: number }> = ({ index, total }) => {
  const frame = useCurrentFrame();
  const a = useEntrada(10);
  const b = useEntrada(22);
  const k = interpolate(frame, [12, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const boia = (fase: number) => Math.sin(frame / 28 + fase) * 10;
  const cor = index % 2 === 0 ? C.green : C.gold;
  const anel = (index + 1) / total;
  const R = 34;
  const circ = 2 * Math.PI * R;
  return (
    <>
      <Vidro style={{ left: 34, top: 620, opacity: a, transform: `translate(${(1 - a) * -120}px, ${boia(0)}px) rotate(-3deg)` }}>
        <MiniGrafico seed={`s${index}`} cor={cor} k={k} />
      </Vidro>
      <Vidro style={{ right: 34, top: 130, display: "flex", alignItems: "center", gap: 14, opacity: b, transform: `translate(${(1 - b) * 120}px, ${boia(2)}px) rotate(3deg)` }}>
        <svg width={84} height={84} viewBox="0 0 84 84">
          <circle cx={42} cy={42} r={R} fill="none" stroke={C.track} strokeWidth={9} />
          <circle
            cx={42}
            cy={42}
            r={R}
            fill="none"
            stroke={C.gold}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - anel * k)}
            transform="rotate(-90 42 42)"
          />
        </svg>
        <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 16, letterSpacing: 2, color: C.muted, lineHeight: 1.4 }}>
          AULA
          <div style={{ fontFamily: DISPLAY, fontSize: 40, letterSpacing: 0, color: C.ink }}>{Math.round(anel * k * 100)}%</div>
        </div>
      </Vidro>
    </>
  );
};

/** Transição: duas faixas coloridas atravessam a tela na troca de cena. */
export const TransicaoFaixas: React.FC<{ index: number }> = ({ index }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (index === 0 || frame > 22) return null;
  const x1 = interpolate(frame, [0, 16], [-0.4, 1.3], { extrapolateRight: "clamp" });
  const x2 = interpolate(frame, [4, 22], [-0.4, 1.3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const faixa = (x: number, cor: string, w: number): React.CSSProperties => ({
    position: "absolute",
    top: -height * 0.2,
    height: height * 1.4,
    width: w,
    left: x * width,
    transform: "skewX(-18deg)",
    background: cor,
    opacity: 0.85,
  });
  return (
    <>
      <div style={faixa(x1, GOLD_GRADIENT, 220)} />
      <div style={faixa(x2, `linear-gradient(180deg, #34D07F, ${C.green})`, 120)} />
    </>
  );
};

/** Faixa de palavras-chave do episódio correndo no rodapé, estilo letreiro de bolsa. */
export const FaixaRodape: React.FC<{ episode: Episode }> = ({ episode }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const palavras = (episode.tags?.length ? episode.tags : ["educação financeira"]).map((t) => t.toUpperCase());
  const itens = [...palavras, ...palavras, ...palavras, ...palavras];
  // largura aproximada de uma volta das palavras, para o letreiro emendar sem pulo
  const volta = itens.reduce((soma, t) => soma + t.length * 15.5 + 34 + 16 + 34, 0);
  const desloc = (frame * 2.2) % Math.max(width, volta);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: height - 46, height: 46, background: C.ink, overflow: "hidden", display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 34, whiteSpace: "nowrap", transform: `translateX(${-desloc}px)` }}>
        {[...itens, ...itens].map((t, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 34, fontFamily: BODY, fontWeight: 800, fontSize: 20, letterSpacing: 3, color: "#FFFFFF" }}>
            {t}
            <span style={{ color: i % 2 ? C.green : C.gold, fontSize: 16 }}>{i % 2 ? "▲" : "●"}</span>
          </span>
        ))}
      </div>
    </div>
  );
};
