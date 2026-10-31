import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { C } from "../theme";
import { BODY } from "../fonts";

export const Header: React.FC<{ name: string }> = ({ name }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = frame / Math.max(1, durationInFrames - 1);
  const intro = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  return (
    <>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: "rgba(255,255,255,0.06)" }}>
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${C.green}, ${C.gold})`,
            boxShadow: `0 0 18px ${C.gold}`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 70,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
          opacity: intro,
          fontFamily: BODY,
          fontWeight: 800,
          fontSize: 30,
          letterSpacing: 8,
          color: C.white,
        }}
      >
        <div style={{ width: 14, height: 14, borderRadius: 7, background: C.gold, boxShadow: `0 0 16px ${C.gold}` }} />
        <span>{name}</span>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: C.green, boxShadow: `0 0 16px ${C.green}` }} />
      </div>
    </>
  );
};
