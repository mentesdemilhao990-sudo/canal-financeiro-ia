import React, { useMemo } from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";

/** Fundo de documentário: gradiente escuro, grade, velas de bolsa ao fundo, poeira dourada e vinheta. */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const candles = useMemo(
    () =>
      new Array(26).fill(0).map((_, i) => {
        const base = 1300 - i * 22 + Math.sin(i * 0.9) * 90;
        const body = 40 + random(`cb${i}`) * 110;
        return { x: i * 48, y: base - body / 2, body, wick: body + 30 + random(`cw${i}`) * 80, up: random(`cu${i}`) > 0.35 };
      }),
    [],
  );

  const dust = useMemo(
    () =>
      new Array(40).fill(0).map((_, i) => ({
        x: random(`dx${i}`) * width,
        y: random(`dy${i}`) * height,
        r: 1.5 + random(`dr${i}`) * 3.5,
        speed: 0.25 + random(`ds${i}`) * 0.8,
        phase: random(`dp${i}`) * Math.PI * 2,
      })),
    [width, height],
  );

  const drift = frame * 0.6;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 50% 30%, #101820 0%, ${C.bg} 60%, #020304 100%)` }}>
      {/* grade */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px)`,
          backgroundSize: "90px 90px",
          backgroundPosition: `0px ${drift % 90}px`,
          opacity: 0.35,
          maskImage: "radial-gradient(80% 60% at 50% 45%, black 30%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(80% 60% at 50% 45%, black 30%, transparent 85%)",
        }}
      />
      {/* velas ao fundo */}
      <svg width={width} height={height} style={{ position: "absolute", opacity: 0.09, transform: `translateX(${-(frame * 0.8) % 48}px)` }}>
        {candles.map((c, i) => (
          <g key={i}>
            <rect x={c.x + 20} y={c.y + c.body / 2 - c.wick / 2} width={3} height={c.wick} fill={c.up ? C.green : C.red} />
            <rect x={c.x + 8} y={c.y} width={27} height={c.body} rx={3} fill={c.up ? C.green : C.red} />
          </g>
        ))}
      </svg>
      {/* brilho dourado lento */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(40% 25% at ${50 + Math.sin(frame / 90) * 18}% ${28 + Math.cos(frame / 110) * 6}%, rgba(242,193,78,0.10), transparent 70%)`,
        }}
      />
      {/* poeira */}
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {dust.map((d, i) => {
          const y = (d.y - frame * d.speed + height) % height;
          const tw = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(frame / 20 + d.phase));
          return <circle key={i} cx={d.x + Math.sin(frame / 60 + d.phase) * 12} cy={y} r={d.r} fill={C.gold} opacity={tw} />;
        })}
      </svg>
      {/* vinheta */}
      <AbsoluteFill style={{ background: "radial-gradient(90% 70% at 50% 45%, transparent 55%, rgba(0,0,0,0.75) 100%)" }} />
    </AbsoluteFill>
  );
};
