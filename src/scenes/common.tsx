import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { BODY, DISPLAY } from "../fonts";

export const useIn = (delay: number, config = { damping: 18, stiffness: 120 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

export const Kicker: React.FC<{ text: string; delay?: number; color?: string }> = ({ text, delay = 0, color = C.green }) => {
  const p = useIn(delay);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
      <div style={{ width: 70 * p, height: 4, background: color, borderRadius: 2 }} />
      <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 32, letterSpacing: 6, textTransform: "uppercase", color }}>{text}</span>
      <div style={{ width: 70 * p, height: 4, background: color, borderRadius: 2 }} />
    </div>
  );
};

export const Title: React.FC<{ text: string; delay?: number; size?: number; color?: string }> = ({ text, delay = 0, size = 92, color = C.white }) => {
  const p = useIn(delay);
  return (
    <div
      style={{
        fontFamily: DISPLAY,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: 2,
        color,
        textAlign: "center",
        opacity: p,
        transform: `translateY(${(1 - p) * 30}px)`,
        whiteSpace: "pre-line",
      }}
    >
      {text}
    </div>
  );
};

export const Caption: React.FC<{ text?: string; delay?: number }> = ({ text, delay = 0 }) => {
  const frame = useCurrentFrame();
  if (!text) return null;
  const o = interpolate(frame - delay, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: 30, color: C.muted, textAlign: "center", opacity: o, marginTop: 34, lineHeight: 1.3 }}>
      {text}
    </div>
  );
};

export const Panel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; glow?: string }> = ({ children, style, glow = C.gold }) => (
  <div
    style={{
      background: C.panel,
      border: `1.5px solid ${glow}44`,
      borderRadius: 34,
      boxShadow: `0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 60px ${glow}14`,
      ...style,
    }}
  >
    {children}
  </div>
);
