import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Episode } from "../types";
import { tituloDaCena } from "../lib/capitulos.mjs";
import { C, GOLD_GRADIENT } from "../theme";
import { BODY, DISPLAY } from "../fonts";
import { useIn } from "../scenes/common";

// Vídeo longo (horizontal 1920x1080): as cenas foram desenhadas para a tela
// vertical, então ficam num "palco" à direita, um pouco reduzidas, e a
// esquerda mostra em que parte da aula a pessoa está.

/** Área útil das cenas verticais (igual ao Stage de SceneShell). */
const STAGE = { x: 70, y: 190, w: 940, h: 1150 };
/** Onde o palco aparece no vídeo horizontal. */
const BOX = { x: 840, y: 96, w: 1000, h: 790 };

/** Desenha a cena vertical reduzida dentro da caixa da direita, com um zoom lento. */
export const PalcoHorizontal: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame();
  const s = Math.min(BOX.w / STAGE.w, BOX.h / STAGE.h);
  const zoom = interpolate(frame, [0, Math.max(1, duration)], [1, 1.04], { extrapolateRight: "clamp" });
  const left = BOX.x + (BOX.w - STAGE.w * s) / 2 - STAGE.x * s;
  const top = BOX.y + (BOX.h - STAGE.h * s) / 2 - STAGE.y * s;
  const cx = STAGE.x + STAGE.w / 2;
  const cy = STAGE.y + STAGE.h / 2;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: 1080,
        height: 1920,
        transformOrigin: "0 0",
        transform: `scale(${s}) translate(${cx}px, ${cy}px) scale(${zoom}) translate(${-cx}px, ${-cy}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** Painel da esquerda: parte atual, título da parte e o andamento da aula. */
export const PainelLateral: React.FC<{ episode: Episode; index: number }> = ({ episode, index }) => {
  const p = useIn(2);
  const q = useIn(8);
  const total = episode.scenes.length;
  const scene = episode.scenes[index];
  const titulo = tituloDaCena(scene);
  const tamanho = titulo.length > 34 ? 64 : titulo.length > 20 ? 76 : 92;
  // Pauta da aula: a parte anterior, a atual (em destaque) e as próximas.
  const ini = Math.max(0, Math.min(index - 1, total - 5));
  const agenda = episode.scenes.slice(ini, ini + 5).map((s, k) => ({ i: ini + k, t: tituloDaCena(s) }));
  return (
    <div style={{ position: "absolute", left: 96, top: 150, width: 680, height: 700, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 24, color: C.muted, letterSpacing: 1, opacity: p, lineHeight: 1.3, marginBottom: 26 }}>{episode.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
        <div style={{ width: 60 * p, height: 4, background: C.green, borderRadius: 2 }} />
        <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 28, letterSpacing: 6, color: C.green }}>
          PARTE {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 30 }}>
        {agenda.map(({ i, t }) =>
          i === index ? (
            <div
              key={i}
              style={{
                fontFamily: DISPLAY,
                fontSize: tamanho,
                lineHeight: 1.02,
                margin: "6px 0",
                backgroundImage: GOLD_GRADIENT,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                opacity: q,
                transform: `translateX(${(1 - q) * -30}px)`,
                filter: "drop-shadow(0 10px 30px rgba(232,163,23,0.25))",
              }}
            >
              {t}
            </div>
          ) : (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, opacity: p * (i < index ? 0.45 : 0.7) }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, background: i < index ? C.green : C.track }} />
              <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 26, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t}</span>
            </div>
          ),
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 34, opacity: q }}>
        {episode.scenes.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              background: i < index ? C.green : i === index ? C.gold : C.track,
              boxShadow: i === index ? `0 0 14px ${C.gold}` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
};

/** Divisória fina entre o painel e o palco. */
export const Divisoria: React.FC = () => {
  const { height } = useVideoConfig();
  return <div style={{ position: "absolute", left: 806, top: height * 0.16, height: height * 0.62, width: 2, background: `linear-gradient(180deg, transparent, ${C.gold}66, transparent)` }} />;
};
