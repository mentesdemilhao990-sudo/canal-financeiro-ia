// Título curto de cada cena: aparece no painel do vídeo longo e vira capítulo na descrição do YouTube.

/** @param {any} scene */
export function tituloDaCena(scene) {
  const d = scene.data ?? {};
  switch (scene.template) {
    case "hook":
      return d.title;
    case "split":
      return `${d.left?.label} x ${d.right?.label}`;
    case "counter":
      return d.label;
    case "outro":
      return String(d.title ?? "").split("\n")[0];
    default:
      return d.title;
  }
}

const mmss = (s) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/**
 * Capítulos no formato do YouTube ("0:00 Título"). O YouTube só aceita se o
 * primeiro for 0:00, houver pelo menos 3 e cada um tiver 10 s ou mais;
 * cenas curtas são juntadas à anterior. Devolve [] se não der.
 * @param {any} episode
 * @param {{start:number,end:number}[]} cenas tempos de cada cena (timeline.scenes)
 */
export function capitulos(episode, cenas) {
  if (!cenas?.length || cenas.length !== episode.scenes.length) return [];
  const lista = [];
  episode.scenes.forEach((s, i) => {
    const start = i === 0 ? 0 : cenas[i].start;
    const ultimo = lista.at(-1);
    if (ultimo && start - ultimo.start < 10) return; // curto demais: fica dentro do anterior
    lista.push({ start, titulo: String(tituloDaCena(s) ?? "").replace(/\s+/g, " ").replace(/[<>]/g, "").trim() || `Parte ${i + 1}` });
  });
  const fim = cenas.at(-1).end;
  if (lista.length && fim - lista.at(-1).start < 10) lista.pop();
  return lista.length >= 3 ? lista.map((c) => ({ ...c, tempo: mmss(c.start) })) : [];
}
