import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../types";
import { C, fmtNumber, seriesColor } from "../theme";
import { BODY, DISPLAY } from "../fonts";
import { Stage } from "../components/SceneShell";
import { Caption, Panel, Title } from "./common";

export const Bars: React.FC<SceneProps<"bars">> = ({ scene, duration }) => {
  const frame = useCurrentFrame();
  const d = scene.data;
  const max = Math.max(...d.items.map((i) => i.value));
  const H = 620;
  return (
    <Stage>
      <Title text={d.title} size={96} />
      <Panel style={{ marginTop: 40, padding: "40px 40px 30px", width: 940 }}>
        <div style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-end", height: H + 150 }}>
          {d.items.map((it, i) => {
            const start = 10 + i * Math.round(duration * 0.12);
            const k = interpolate(frame, [start, start + 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
            const col = seriesColor(it.color);
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 760 / d.items.length }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 58, color: col, opacity: k, marginBottom: 12 }}>
                  {d.valuePrefix}
                  {fmtNumber(it.value * k)}
                  {d.valueSuffix}
                </div>
                <div
                  style={{
                    width: "70%",
                    height: (it.value / max) * H * k,
                    borderRadius: "18px 18px 6px 6px",
                    background: `linear-gradient(180deg, ${col}, ${col}33)`,
                    boxShadow: `0 0 30px ${col}44`,
                  }}
                />
                <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 30, color: C.ink, marginTop: 18, textAlign: "center" }}>{it.label}</div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Caption text={d.caption} delay={20} />
    </Stage>
  );
};
