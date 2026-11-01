import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";

/** Entrada e saída suaves de cada cena, com um traço dourado de transição. */
export const SceneShell: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 110 } });
  const exit = interpolate(frame, [duration - 10, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sweep = interpolate(frame, [0, 16], [-0.2, 1.2], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: Math.min(enter, exit),
          transform: `translateY(${(1 - enter) * 60 + (1 - exit) * -40}px) scale(${0.96 + enter * 0.04})`,
          filter: `blur(${(1 - Math.min(enter, exit)) * 10}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
      {frame < 18 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 6,
            left: sweep * width,
            background: `linear-gradient(180deg, transparent, ${C.gold}, transparent)`,
            boxShadow: `0 0 40px 10px rgba(242,193,78,0.35)`,
            opacity: 0.8,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

/** Área útil da cena (evita o topo com o nome do canal e a faixa da legenda). */
export const Stage: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      position: "absolute",
      top: 190,
      left: 70,
      right: 70,
      height: 1150,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      ...style,
    }}
  >
    {children}
  </div>
);
