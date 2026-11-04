// Formato dos arquivos de episódio (episodes/*.json).
import { z } from "zod";

const text = (max) => z.string().trim().min(1).max(max);

const hook = z.object({
  template: z.literal("hook"),
  data: z.object({
    kicker: text(40).optional(),
    title: text(60),
    subtitle: text(90).optional(),
  }),
});

const side = z.object({
  label: text(20),
  icon: z.enum(["safe", "growth", "piggy", "chart", "coin", "warning"]).default("coin"),
  points: z.array(text(40)).min(1).max(4),
});

const split = z.object({
  template: z.literal("split"),
  data: z.object({ left: side, right: side }),
});

const counter = z.object({
  template: z.literal("counter"),
  data: z.object({
    label: text(60),
    from: z.number(),
    to: z.number(),
    prefix: z.string().max(6).default(""),
    suffix: z.string().max(6).default(""),
    decimals: z.number().int().min(0).max(2).default(0),
    trend: z.enum(["up", "down"]).default("up"),
    caption: text(80).optional(),
    badge: text(10).optional(),
  }),
});

const color = z.enum(["green", "gold", "red", "white"]);

const lineChart = z.object({
  template: z.literal("lineChart"),
  data: z
    .object({
      title: text(50),
      xLabels: z.array(z.string().max(10)).min(2).max(12),
      valuePrefix: z.string().max(6).default(""),
      valueSuffix: z.string().max(6).default(""),
      series: z
        .array(z.object({ label: text(30), color: color.default("green"), values: z.array(z.number()).min(2).max(12) }))
        .min(1)
        .max(3),
      caption: text(80).optional(),
    })
    .refine((d) => d.series.every((s) => s.values.length === d.xLabels.length), {
      message: "cada série precisa ter um valor para cada item de xLabels",
    }),
});

const bars = z.object({
  template: z.literal("bars"),
  data: z.object({
    title: text(50),
    valuePrefix: z.string().max(6).default(""),
    valueSuffix: z.string().max(6).default(""),
    items: z.array(z.object({ label: text(24), value: z.number(), color: color.default("green") })).min(2).max(5),
    caption: text(80).optional(),
  }),
});

const list = z.object({
  template: z.literal("list"),
  data: z.object({ title: text(50), items: z.array(text(50)).min(2).max(5) }),
});

const outro = z.object({
  template: z.literal("outro"),
  data: z.object({
    title: text(80),
    points: z.array(text(45)).max(3).default([]),
    cta: text(30).default("Siga para mais"),
  }),
});

const base = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "use só letras minúsculas, números e hífen"),
  narration: z.string().trim().min(10).max(700),
});

/** Modelos de cena, para quem precisa do formato de cada um (ex.: a IA que escreve roteiros). */
export const MODELOS_CENA = { hook, split, counter, lineChart, bars, list, outro };

export const sceneSchema = z.discriminatedUnion("template", [hook, split, counter, lineChart, bars, list, outro]).and(base);

const dataHora = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/;

export const TEMPLATES = ["hook", "split", "counter", "lineChart", "bars", "list", "outro"];

/**
 * Formatos de vídeo:
 *  - short: vertical 1080x1920, 30 a 60 s (YouTube Shorts)
 *  - longo: horizontal 1920x1080, 1,5 a 15 min (vídeo normal; os diários têm 8 min ou mais)
 */
export const FORMATOS = {
  short: { width: 1080, height: 1920, minDuracao: 30, maxDuracao: 60, minCenas: 3, maxCenas: 8, maxNarracao: 400 },
  longo: { width: 1920, height: 1080, minDuracao: 90, maxDuracao: 900, minCenas: 6, maxCenas: 44, maxNarracao: 700 },
};

export const episodeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "use só letras minúsculas, números e hífen"),
    title: text(100),
    description: z.string().max(500).default(""),
    tags: z.array(z.string()).max(15).default([]),
    formato: z.enum(["short", "longo"]).default("short"),
    targetDurationSeconds: z.number().min(30).max(900).default(45),
    disclaimer: z.string().max(120).optional(),
    voice: z.object({ lengthScale: z.number().min(0.7).max(1.4).optional() }).optional(),
    music: z.object({ enabled: z.boolean().optional(), volume: z.number().min(0).max(0.4).optional() }).optional(),
    scenes: z.array(sceneSchema).min(3).max(44),
    // Opcional: quando e como publicar (veja docs/publicacao.md).
    publicacao: z
      .object({
        youtube: z
          .object({
            enviarEm: z.string().regex(dataHora, "use o formato 2026-11-05 ou 2026-11-05T10:00-03:00").optional(),
            titulo: text(100).optional(),
            hashtags: z.array(z.string().regex(/^#?[\p{L}\p{N}_]+$/u, "hashtag sem espaços")).max(5).optional(),
            tagsExtras: z.array(z.string().max(60)).max(15).optional(),
          })
          .optional(),
        instagram: z.object({ enviarEm: z.string().regex(dataHora).optional(), legenda: z.string().max(2200).optional() }).optional(),
        tiktok: z.object({ enviarEm: z.string().regex(dataHora).optional(), legenda: z.string().max(2200).optional() }).optional(),
      })
      .optional(),
  })
  .refine((e) => new Set(e.scenes.map((s) => s.id)).size === e.scenes.length, {
    message: "ids de cena repetidos",
  })
  .superRefine((e, ctx) => {
    const f = FORMATOS[e.formato];
    const nome = e.formato === "short" ? "Short" : "vídeo longo";
    if (e.targetDurationSeconds < f.minDuracao || e.targetDurationSeconds > f.maxDuracao)
      ctx.addIssue({ code: "custom", path: ["targetDurationSeconds"], message: `no ${nome} a duração vai de ${f.minDuracao} a ${f.maxDuracao} s` });
    if (e.scenes.length < f.minCenas || e.scenes.length > f.maxCenas)
      ctx.addIssue({ code: "custom", path: ["scenes"], message: `no ${nome} use de ${f.minCenas} a ${f.maxCenas} cenas` });
    e.scenes.forEach((s, i) => {
      if (s.narration.length > f.maxNarracao)
        ctx.addIssue({ code: "custom", path: ["scenes", i, "narration"], message: `narração com mais de ${f.maxNarracao} caracteres` });
    });
  });

/** Largura e altura do vídeo conforme o formato. */
export const dimensoes = (episode) => FORMATOS[episode?.formato ?? "short"] ?? FORMATOS.short;

/** Valida um episódio e devolve os dados com valores padrão, ou lança erro legível. */
export function parseEpisode(raw, source = "episódio") {
  const r = episodeSchema.safeParse(raw);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join(".") || "(raiz)"}: ${i.message}`);
    throw new Error(`${source} inválido:\n${lines.join("\n")}`);
  }
  return r.data;
}
