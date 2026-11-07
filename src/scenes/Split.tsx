import React from "react";
import type { SceneProps } from "../types";
import { C } from "../theme";
import { BODY, DISPLAY } from "../fonts";
import { Stage } from "../components/SceneShell";
import { useHorizontal } from "../components/Landscape";
import { Icon } from "../components/Icons";
import { Panel, useIn } from "./common";

const Card: React.FC<{
  side: SceneProps<"split">["scene"]["data"]["left"];
  delay: number;
  color: string;
  from: number;
}> = ({ side, delay, color, from }) => {
  const horizontal = useHorizontal();
  const p = useIn(delay);
  const icon = useIn(delay + 6, { damping: 30, stiffness: 60 });
  return (
    <Panel glow={color} style={{ width: horizontal ? 760 : 440, padding: "50px 34px 46px", opacity: p, transform: `translateX(${(1 - p) * from}px)` }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Icon name={side.icon} size={150} color={color} progress={icon} />
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 104, textAlign: "center", color, marginTop: 20, letterSpacing: 2 }}>{side.label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 26 }}>
        {side.points.map((pt, i) => {
          const q = useIn(delay + 14 + i * 7);
          return (
            <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start", opacity: q, transform: `translateY(${(1 - q) * 16}px)` }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: color, marginTop: 13, flexShrink: 0 }} />
              <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: horizontal ? 40 : 36, color: C.ink, lineHeight: 1.25 }}>{pt}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

export const Split: React.FC<SceneProps<"split">> = ({ scene, duration }) => {
  const { left, right } = scene.data;
  const horizontal = useHorizontal();
  const rightDelay = Math.round(duration * 0.42);
  const vs = useIn(rightDelay - 6, { damping: 9, stiffness: 160 });
  return (
    <Stage>
      <div style={{ display: "flex", gap: horizontal ? 140 : 60, alignItems: "stretch", position: "relative" }}>
        <Card side={left} delay={4} color={C.gold} from={-120} />
        <Card side={right} delay={rightDelay} color={C.green} from={120} />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 104,
            height: 104,
            marginLeft: -52,
            marginTop: -52,
            borderRadius: 52,
            background: C.card,
            border: `3px solid ${C.gold}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: DISPLAY,
            fontSize: 56,
            color: C.gold,
            transform: `scale(${vs})`,
            boxShadow: "0 0 40px rgba(232,163,23,0.35)",
          }}
        >
          VS
        </div>
      </div>
    </Stage>
  );
};
