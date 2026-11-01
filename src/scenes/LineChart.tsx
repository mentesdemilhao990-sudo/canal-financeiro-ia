import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../types";
import { C, fmtNumber, seriesColor } from "../theme";
import { BODY, DISPLAY } from "../fonts";
import { Stage } from "../components/SceneShell";
import { Caption, Panel, Title } from "./common";

const W = 900;
const H = 640;
const PAD = { l: 30, r: 40, t: 90, b: 70 };

export const LineChart: React.FC<SceneProps<"lineChart">> = ({ scene, duration }) => {
  const frame = useCurrentFrame();
  const d = scene.data;
  const all = d.series.flatMap((s) => s.values);
  const min = Math.min(...all) * 0.85;
  const max = Math.max(...all) * 1.08;
  const n = d.xLabels.length;
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const drawEnd = Math.max(45, Math.round(duration * 0.7));
  const k = interpolate(frame, [12, drawEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const pos = k * (n - 1);

  const pointAt = (vals: number[]) => {
    const i = Math.min(n - 2, Math.floor(pos));
    const f = pos - i;
    const v = vals[i] + (vals[i + 1] - vals[i]) * f;
    return { px: x(i + f), py: y(v), v };
  };

  return (
    <Stage>
      <Title text={d.title} size={84} />
      <Panel style={{ marginTop: 40, padding: "20px 20px 10px" }}>
        <svg width={W} height={H}>
          <defs>
            {d.series.map((s, si) => (
              <linearGradient key={si} id={`area${si}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={seriesColor(s.color)} stopOpacity={0.35} />
                <stop offset="1" stopColor={seriesColor(s.color)} stopOpacity={0} />
              </linearGradient>
            ))}
            <clipPath id="reveal">
              <rect x={0} y={0} width={PAD.l + k * (W - PAD.l - PAD.r) + 2} height={H} />
            </clipPath>
          </defs>
          {[0, 1, 2, 3, 4].map((g) => {
            const gy = PAD.t + (g / 4) * (H - PAD.t - PAD.b);
            return <line key={g} x1={PAD.l} x2={W - PAD.r} y1={gy} y2={gy} stroke={C.line} strokeWidth={2} />;
          })}
          {d.xLabels.map((lab, i) => (
            <text key={i} x={x(i)} y={H - 22} fill={C.muted} fontFamily={BODY} fontWeight={700} fontSize={26} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
              {lab}
            </text>
          ))}
          <g clipPath="url(#reveal)">
            {d.series.map((s, si) => {
              const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
              const area = `M${x(0)},${H - PAD.b} L${s.values.map((v, i) => `${x(i)},${y(v)}`).join(" L")} L${x(n - 1)},${H - PAD.b} Z`;
              return (
                <g key={si}>
                  <path d={area} fill={`url(#area${si})`} />
                  <polyline points={pts} fill="none" stroke={seriesColor(s.color)} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 12px ${seriesColor(s.color)})` }} />
                </g>
              );
            })}
          </g>
          {d.series.map((s, si) => {
            const p = pointAt(s.values);
            const col = seriesColor(s.color);
            const above = si === 0;
            const right = p.px < W * 0.55;
            const lx = right ? p.px + 26 : p.px - 26;
            return (
              <g key={si}>
                <circle cx={p.px} cy={p.py} r={16} fill={C.bg} stroke={col} strokeWidth={7} />
                <text x={lx} y={p.py + (above ? -34 : 62)} fill={col} fontFamily={DISPLAY} fontSize={64} textAnchor={right ? "start" : "end"}>
                  {d.valuePrefix}
                  {fmtNumber(p.v)}
                  {d.valueSuffix}
                </text>
              </g>
            );
          })}
        </svg>
      </Panel>
      <div style={{ display: "flex", gap: 40, marginTop: 30 }}>
        {d.series.map((s, si) => (
          <div key={si} style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: BODY, fontWeight: 700, fontSize: 32, color: C.white }}>
            <div style={{ width: 34, height: 10, borderRadius: 5, background: seriesColor(s.color) }} />
            {s.label}
          </div>
        ))}
      </div>
      <Caption text={d.caption} delay={20} />
    </Stage>
  );
};
