// Linha do tempo aproximada (15 caracteres/s), usada só para pré-visualizar sem narração.
export function estimateTimeline(episode) {
  let t = 0.35;
  const scenes = episode.scenes.map((s, i) => {
    const start = i === 0 ? 0 : t;
    const words = s.narration.split(/\s+/).filter(Boolean).map((w) => {
      const d = (w.length + 1.5) / 15;
      const out = { text: w, start: +t.toFixed(3), end: +(t + d).toFixed(3) };
      t += d;
      return out;
    });
    t += 0.4;
    return { id: s.id, start, end: +t.toFixed(3), words };
  });
  return { duration: +(t + 0.5).toFixed(3), engine: "estimate", music: { enabled: false, volume: 0 }, scenes };
}
