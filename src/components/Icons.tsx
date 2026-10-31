import React from "react";
import { C } from "../theme";

type P = { size?: number; color?: string; progress?: number };

export const Icon: React.FC<P & { name: string }> = ({ name, size = 120, color = C.gold, progress = 1 }) => {
  const s = { width: size, height: size };
  const sw = 5;
  const dash = (len: number) => ({ strokeDasharray: len, strokeDashoffset: len * (1 - progress) });
  switch (name) {
    case "safe":
      return (
        <svg viewBox="0 0 100 100" style={s} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <rect x="12" y="14" width="76" height="68" rx="8" style={dash(290)} />
          <circle cx="50" cy="48" r="16" style={dash(101)} />
          <path d="M50 32v6M50 58v6M34 48h6M60 48h6" style={dash(40)} />
          <path d="M24 82v6M76 82v6" />
        </svg>
      );
    case "growth":
      return (
        <svg viewBox="0 0 100 100" style={s} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 84h76" />
          <path d="M16 72l22-22 14 12 32-34" style={dash(130)} />
          <path d="M66 28h18v18" style={dash(40)} />
        </svg>
      );
    case "piggy":
      return (
        <svg viewBox="0 0 100 100" style={s} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 52c0-16 14-26 32-26s30 10 30 26-12 24-30 24H40l-4 10h-8l-2-14c-4-4-6-12-6-20z" style={dash(260)} />
          <path d="M44 26a8 8 0 1 1 14 0" />
          <circle cx="66" cy="46" r="2.5" fill={color} />
        </svg>
      );
    case "chart":
      return (
        <svg viewBox="0 0 100 100" style={s} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
          <path d="M14 86h72" />
          <path d="M26 76V56M44 76V40M62 76V48M80 76V22" style={dash(120)} />
        </svg>
      );
    case "warning":
      return (
        <svg viewBox="0 0 100 100" style={s} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M50 12l40 72H10z" style={dash(240)} />
          <path d="M50 40v20M50 70v2" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 100 100" style={s} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
          <circle cx="50" cy="50" r="36" style={dash(227)} />
          <path d="M50 28v44M60 36c-3-3-7-4-11-4-6 0-10 3-10 8 0 12 22 6 22 18 0 5-5 8-11 8-5 0-9-2-12-5" />
        </svg>
      );
  }
};
