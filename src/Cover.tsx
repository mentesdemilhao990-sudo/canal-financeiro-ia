import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { EpisodeProps } from "./types";
import { C, GOLD_GRADIENT } from "./theme";
import { BODY, DISPLAY, ensureFonts } from "./fonts";
import { Background } from "./components/Background";

ensureFonts();

/** Capa (thumbnail) do episódio: vertical no Short, horizontal 1280x720 no vídeo longo. */
export const Cover: React.FC<EpisodeProps> = (props) => {
  const { width, height } = useVideoConfig();
  return width > height ? <CoverHorizontal {...props} /> : <CoverVertical {...props} />;
};

const textoGrande = (episode: EpisodeProps["episode"]) => {
  const hook = episode.scenes.find((s) => s.template === "hook");
  return hook && hook.template === "hook" ? hook.data.title : episode.title;
};

const CoverHorizontal: React.FC<EpisodeProps> = ({ episode, channel }) => {
  const big = textoGrande(episode);
  return (
    <AbsoluteFill>
      <Background />
      <svg width={1280} height={720} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="cgh" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={C.green} stopOpacity={0.35} />
            <stop offset="1" stopColor={C.green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d="M640 620 L760 560 L860 590 L980 470 L1080 500 L1180 360 L1280 300 L1280 720 L640 720 Z" fill="url(#cgh)" />
        <polyline points="640,620 760,560 860,590 980,470 1080,500 1180,360 1280,300" fill="none" stroke={C.green} strokeWidth={9} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 14px ${C.green})` }} />
      </svg>
      <div style={{ position: "absolute", top: 40, left: 60, fontFamily: BODY, fontWeight: 800, fontSize: 26, letterSpacing: 8, color: C.gold }}>{channel.name}</div>
      <div style={{ position: "absolute", top: 100, left: 60, width: 1000, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontFamily: DISPLAY,
            fontSize: big.length > 22 ? 120 : 160,
            lineHeight: 0.95,
            backgroundImage: GOLD_GRADIENT,
            WebkitBackgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 10px 30px rgba(232,163,23,0.35))",
          }}
        >
          {big}
        </div>
        <div style={{ width: 360, height: 7, borderRadius: 4, background: GOLD_GRADIENT, margin: "26px 0" }} />
        <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 44, lineHeight: 1.2, color: C.ink, maxWidth: 820, textShadow: "none" }}>
          {episode.title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CoverVertical: React.FC<EpisodeProps> = ({ episode, channel }) => {
  const big = textoGrande(episode);
  return (
    <AbsoluteFill>
      <Background />
      <svg width={1080} height={1920} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="cg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={C.green} stopOpacity={0.4} />
            <stop offset="1" stopColor={C.green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d="M0 1640 L180 1560 L330 1600 L500 1440 L650 1480 L820 1290 L1080 1150 L1080 1920 L0 1920 Z" fill="url(#cg)" />
        <polyline points="0,1640 180,1560 330,1600 500,1440 650,1480 820,1290 1080,1150" fill="none" stroke={C.green} strokeWidth={12} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 18px ${C.green})` }} />
        <polyline points="0,1500 200,1560 400,1590 600,1650 800,1700 1080,1760" fill="none" stroke={C.red} strokeWidth={8} strokeDasharray="20 14" opacity={0.8} />
      </svg>
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, textAlign: "center", fontFamily: BODY, fontWeight: 800, fontSize: 38, letterSpacing: 10, color: C.gold }}>
        {channel.name}
      </div>
      <div style={{ position: "absolute", top: 420, left: 60, right: 60, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            fontFamily: DISPLAY,
            fontSize: 230,
            lineHeight: 0.95,
            textAlign: "center",
            backgroundImage: GOLD_GRADIENT,
            WebkitBackgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 12px 40px rgba(232,163,23,0.35))",
          }}
        >
          {big}
        </div>
        <div style={{ width: 600, height: 8, borderRadius: 4, background: GOLD_GRADIENT, margin: "40px 0" }} />
        <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 64, lineHeight: 1.2, color: C.ink, textAlign: "center", textShadow: "none" }}>
          {episode.title}
        </div>
      </div>
    </AbsoluteFill>
  );
};
