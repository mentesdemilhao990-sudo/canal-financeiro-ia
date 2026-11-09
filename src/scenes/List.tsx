import React from "react";
import type { SceneProps } from "../types";
import { C, GOLD_GRADIENT } from "../theme";
import { BODY, DISPLAY } from "../fonts";
import { Stage } from "../components/SceneShell";
import { useHorizontal } from "../components/Landscape";
import { Panel, Title, useIn } from "./common";

export const List: React.FC<SceneProps<"list">> = ({ scene, duration }) => {
  const horizontal = useHorizontal();
  const d = scene.data;
  const step = Math.round((duration * 0.7) / d.items.length);
  return (
    <Stage>
      <Title text={d.title} size={100} />
      <div style={{ display: "flex", flexDirection: "column", gap: horizontal ? 20 : 28, marginTop: horizontal ? 40 : 50, width: horizontal ? 1500 : 940 }}>
        {d.items.map((it, i) => {
          const p = useIn(10 + i * step);
          return (
            <Panel key={i} glow={C.green} style={{ display: "flex", alignItems: "center", gap: 30, padding: horizontal ? "22px 36px" : "30px 36px", opacity: p, transform: `translateX(${(1 - p) * 140}px)` }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 90, lineHeight: 1, backgroundImage: GOLD_GRADIENT, WebkitBackgroundClip: "text", color: "transparent", minWidth: 70 }}>
                {i + 1}
              </div>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 40, color: C.ink, lineHeight: 1.25 }}>{it}</div>
            </Panel>
          );
        })}
      </div>
    </Stage>
  );
};
