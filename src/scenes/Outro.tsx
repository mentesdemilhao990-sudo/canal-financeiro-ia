import React from "react";
import { useCurrentFrame } from "remotion";
import type { SceneProps } from "../types";
import { C, GOLD_GRADIENT } from "../theme";
import { BODY, DISPLAY } from "../fonts";
import { Stage } from "../components/SceneShell";
import { useIn } from "./common";

export const Outro: React.FC<SceneProps<"outro">> = ({ scene, channel, episode, duration }) => {
  const frame = useCurrentFrame();
  const d = scene.data;
  const lines = d.title.split("\n");
  const ctaIn = useIn(Math.round(duration * 0.45), { damping: 10, stiffness: 140 });
  const pulse = 1 + Math.sin(frame / 6) * 0.03 * ctaIn;
  return (
    <Stage>
      {lines.map((l, i) => {
        const p = useIn(4 + i * 10);
        return (
          <div
            key={i}
            style={{
              fontFamily: DISPLAY,
              fontSize: 128,
              lineHeight: 1.02,
              textAlign: "center",
              backgroundImage: i % 2 === 0 ? GOLD_GRADIENT : `linear-gradient(180deg, #9CF7C4, ${C.green})`,
              WebkitBackgroundClip: "text",
              color: "transparent",
              opacity: p,
              transform: `translateY(${(1 - p) * 40}px)`,
            }}
          >
            {l}
          </div>
        );
      })}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 50 }}>
        {d.points.map((pt, i) => {
          const p = useIn(24 + i * 8);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, opacity: p, transform: `translateX(${(1 - p) * -40}px)` }}>
              <svg width={46} height={46} viewBox="0 0 100 100">
                <circle cx={50} cy={50} r={44} fill="none" stroke={C.green} strokeWidth={8} />
                <path d="M30 52l14 14 28-30" fill="none" stroke={C.green} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={70} strokeDashoffset={70 * (1 - p)} />
              </svg>
              <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 38, color: C.white }}>{pt}</span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 70,
          padding: "26px 60px",
          borderRadius: 60,
          background: GOLD_GRADIENT,
          fontFamily: BODY,
          fontWeight: 900,
          fontSize: 38,
          whiteSpace: "nowrap",
          color: C.bg,
          letterSpacing: 2,
          textTransform: "uppercase",
          transform: `scale(${ctaIn * pulse})`,
          boxShadow: "0 0 50px rgba(242,193,78,0.45)",
        }}
      >
        {d.cta} · {channel.handle}
      </div>
      {episode.disclaimer && (
        <div style={{ position: "absolute", bottom: -20, fontFamily: BODY, fontWeight: 500, fontSize: 24, color: C.muted, textAlign: "center", opacity: ctaIn * 0.9 }}>
          {episode.disclaimer}
        </div>
      )}
    </Stage>
  );
};
