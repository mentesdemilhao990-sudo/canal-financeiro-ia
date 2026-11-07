// Agrupa palavras com tempo em legendas curtas e gera SRT.

const ENDS_PHRASE = /[.!?…:;,]$/;

/**
 * @param {{text:string,start:number,end:number}[]} words
 * @param {{maxWords?:number,maxChars?:number,maxGap?:number}} opts
 * @returns {{start:number,end:number,text:string,words:{text:string,start:number,end:number}[]}[]}
 */
export function groupWords(words, { maxWords = 4, maxChars = 24, maxGap = 0.35 } = {}) {
  const cues = [];
  let cur = [];
  const flush = () => {
    if (cur.length) {
      cues.push({
        start: cur[0].start,
        end: cur[cur.length - 1].end,
        text: cur.map((w) => w.text).join(" "),
        words: cur,
      });
    }
    cur = [];
  };
  for (const w of words) {
    if (cur.length) {
      const chars = cur.map((x) => x.text).join(" ").length + 1 + w.text.length;
      const gap = w.start - cur[cur.length - 1].end;
      if (cur.length >= maxWords || chars > maxChars || gap > maxGap) flush();
    }
    cur.push(w);
    if (ENDS_PHRASE.test(w.text)) flush();
  }
  flush();
  return cues;
}

export function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function toSrt(cues) {
  // A IA de voz às vezes devolve palavras com tempo zero ou fora de ordem
  // (ex.: na emenda entre dois blocos de narração). Aqui cada legenda fica
  // sempre depois da anterior e com pelo menos MIN segundos na tela.
  const MIN = 0.2;
  let prevEnd = 0;
  return (
    cues
      .map((c, i) => {
        const start = Math.max(c.start, prevEnd);
        const next = cues[i + 1];
        // Pequena folga para a legenda não piscar entre frases, sem sobrepor a próxima.
        let end = next ? Math.min(c.end + 0.25, next.start) : c.end + 0.25;
        if (end < start + MIN) end = start + MIN;
        prevEnd = end;
        return `${i + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${c.text}\n`;
      })
      .join("\n") + "\n"
  );
}

export function parseSrt(src) {
  const blocks = src.replace(/\r/g, "").trim().split(/\n\n+/);
  return blocks.map((b) => {
    const [idx, time, ...text] = b.split("\n");
    const m = time?.match(/^(\d\d):(\d\d):(\d\d),(\d\d\d) --> (\d\d):(\d\d):(\d\d),(\d\d\d)$/);
    if (!m) throw new Error(`bloco SRT inválido: ${b}`);
    const t = (a) => +m[a] * 3600 + +m[a + 1] * 60 + +m[a + 2] + +m[a + 3] / 1000;
    return { index: Number(idx), start: t(1), end: t(5), text: text.join("\n") };
  });
}
