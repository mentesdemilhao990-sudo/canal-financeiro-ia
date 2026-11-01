import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../types";
import { C, GOLD_GRADIENT } from "../theme";
import { BODY, DISPLAY } from "../fonts";
import { Stage } from "../components/SceneShell";
import { Kicker, useIn } from "./common";

export const Hook: React.FC<SceneProps<"hook">> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { kicker, title, subtitle } = scene.data;
  const ring = interpolate(frame, [0, 60], [0, 1], { extrapolateRight: "clamp" });
  // Quebra por palavra (nunca no meio da palavra) e anima letra a letra.
  let n = 0;
  const words = title.split(/\s+/).map((w) => Array.from(w).map((ch) => ({ ch, i: n++ })));
  const sub = useIn(28);
  return (
    <Stage>
      <svg width={900} height={900} viewBox="0 0 900 900" style={{ position: "absolute", top: 120, opacity: 0.55, transform: `rotate(${frame * 0.4}deg)` }}>
        <defs>
          <linearGradient id="ring" x1="0" x2="1">
            <stop offset="0" stopColor={C.gold} />
            <stop offset="1" stopColor={C.green} />
          </linearGradient>
        </defs>
        <circle cx={450} cy={450} r={400} fill="none" stroke="url(#ring)" strokeWidth={3} strokeDasharray={2513} strokeDashoffset={2513 * (1 - ring * 0.72)} />
        <circle cx={450} cy={450} r={350} fill="none" stroke={C.gold} strokeOpacity={0.25} strokeWidth={1.5} strokeDasharray="6 14" />
      </svg>
      {kicker && <Kicker text={kicker} delay={4} />}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", marginTop: 40, maxWidth: 940 }}>
        {words.map((word, wi) => (
          <span key={wi} style={{ display: "inline-flex", whiteSpace: "nowrap", margin: "0 18px" }}>
          {word.map(({ ch, i }) => {
          const p = interpolate(frame - 8 - i * 1.6, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const special = /[^\u0000-\u00ff]/.test(ch);
          return (
            <span
              key={i}
              style={{
                fontFamily: special ? BODY : DISPLAY,
                fontWeight: special ? 900 : 400,
                fontSize: special ? 150 : 200,
                lineHeight: 1.05,
                padding: 0,
                backgroundImage: special ? `linear-gradient(180deg, #9CF7C4, ${C.green})` : GOLD_GRADIENT,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                opacity: p,
                transform: `translateY(${(1 - p) * 60}px) scale(${0.8 + p * 0.2})`,
                display: "inline-block",
                whiteSpace: "pre",
                filter: "drop-shadow(0 10px 30px rgba(242,193,78,0.25))",
              }}
            >
              {ch}
            </span>
          );
          })}
          </span>
        ))}
      </div>
      <div style={{ width: 520 * useIn(22), height: 5, borderRadius: 3, background: GOLD_GRADIENT, marginTop: 18 }} />
      {subtitle && (
        <div
          style={{
            fontFamily: BODY,
            fontWeight: 700,
            fontSize: 46,
            color: C.white,
            textAlign: "center",
            marginTop: 44,
            opacity: sub,
            transform: `translateY(${(1 - sub) * 24}px)`,
            maxWidth: 860,
            lineHeight: 1.25,
          }}
        >
          {subtitle}
        </div>
      )}
    </Stage>
  );
};
