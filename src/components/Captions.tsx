import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { groupWords } from "../lib/captions.mjs";
import type { Word } from "../types";
import { C } from "../theme";
import { BODY } from "../fonts";

/** Legendas queimadas no vídeo, palavra a palavra, sincronizadas com a narração. */
export const Captions: React.FC<{ words: Word[]; top?: number }> = ({ words, top = 1390 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cues = useMemo(() => groupWords(words), [words]);
  const cue = cues.find((c, i) => t >= c.start - 0.05 && t < (cues[i + 1] ? Math.min(c.end + 0.3, cues[i + 1].start - 0.05) : c.end + 0.6));
  if (!cue) return null;

  const cueFrame = frame - Math.round(cue.start * fps);
  const pop = spring({ frame: cueFrame, fps, config: { damping: 14, stiffness: 180 } });

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 70,
        right: 70,
        display: "flex",
        justifyContent: "center",
        transform: `translateY(${(1 - pop) * 26}px) scale(${0.92 + pop * 0.08})`,
        opacity: interpolate(pop, [0, 1], [0, 1]),
      }}
    >
      <div
        style={{
          textAlign: "center",
          maxWidth: 900,
          padding: "20px 34px",
          borderRadius: 26,
          background: "rgba(4, 6, 8, 0.72)",
          border: "1px solid rgba(242,193,78,0.25)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
        }}
      >
        {cue.words.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          const spoken = t >= w.end;
          return (
            <span
              key={i}
              style={{
                fontFamily: BODY,
                fontWeight: 800,
                fontSize: 62,
                lineHeight: 1.15,
                color: active ? C.gold : spoken ? C.white : "rgba(244,246,247,0.55)",
                textShadow: active ? `0 0 24px rgba(242,193,78,0.55)` : "0 3px 10px rgba(0,0,0,0.8)",
                transform: active ? "scale(1.08)" : "scale(1)",
                display: "inline-block",
                margin: "0 9px",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
