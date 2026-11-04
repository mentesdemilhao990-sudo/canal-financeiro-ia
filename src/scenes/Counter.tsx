import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../types";
import { C, fmtNumber } from "../theme";
import { BODY, DISPLAY } from "../fonts";
import { Stage } from "../components/SceneShell";
import { Caption, Kicker, Panel, useIn } from "./common";

export const Counter: React.FC<SceneProps<"counter">> = ({ scene, duration }) => {
  const frame = useCurrentFrame();
  const d = scene.data;
  const end = Math.max(40, Math.round(duration * 0.78));
  const k = interpolate(frame, [14, end], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const value = d.from + (d.to - d.from) * k;
  const color = d.trend === "down" ? C.red : C.green;
  const ratio = Math.min(d.from, d.to) / Math.max(d.from, d.to);
  const bar = d.trend === "down" ? 1 - (1 - ratio) * k : ratio + (1 - ratio) * k;
  const badge = useIn(end - 4, { damping: 8, stiffness: 170 });
  const shake = d.trend === "down" && k > 0 && k < 1 ? Math.sin(frame * 1.7) * 2 : 0;
  return (
    <Stage>
      <Kicker text={d.label} color={C.gold} />
      <Panel glow={color} style={{ marginTop: 50, padding: "60px 50px", width: 940, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, transform: `translateX(${shake}px)` }}>
          <svg width={90} height={90} viewBox="0 0 100 100" style={{ transform: d.trend === "down" ? "rotate(180deg)" : undefined }}>
            <path d="M50 12 L88 60 H62 V90 H38 V60 H12 Z" fill={color} />
          </svg>
          <div style={{ fontFamily: DISPLAY, fontSize: 210, lineHeight: 1, color: C.ink, textShadow: `0 0 40px ${color}55`, fontVariantNumeric: "tabular-nums" }}>
            {d.prefix}
            {fmtNumber(value, d.decimals)}
            {d.suffix}
          </div>
        </div>
        <div style={{ width: "100%", marginTop: 46 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: BODY, fontWeight: 700, fontSize: 28, color: C.muted, marginBottom: 14 }}>
            <span>Poder de compra</span>
            <span style={{ color }}>{Math.round(bar * 100)}%</span>
          </div>
          <div style={{ height: 40, borderRadius: 20, background: C.track, overflow: "hidden" }}>
            <div style={{ width: `${bar * 100}%`, height: "100%", borderRadius: 20, background: `linear-gradient(90deg, ${C.gold}, ${color})` }} />
          </div>
        </div>
        {d.badge && (
          <div
            style={{
              marginTop: 46,
              fontFamily: DISPLAY,
              fontSize: 100,
              color,
              border: `4px solid ${color}`,
              borderRadius: 24,
              padding: "6px 36px 0",
              transform: `scale(${badge}) rotate(${(1 - badge) * -12}deg)`,
              opacity: badge,
            }}
          >
            {d.badge}
          </div>
        )}
      </Panel>
      <Caption text={d.caption} delay={20} />
    </Stage>
  );
};
