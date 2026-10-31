import type { z } from "zod";
import type { episodeSchema, sceneSchema } from "./lib/schema.mjs";

export type Episode = z.infer<typeof episodeSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneOf<T extends Scene["template"]> = Extract<Scene, { template: T }>;

export type Word = { text: string; start: number; end: number };
export type TimelineScene = { id: string; start: number; end: number; words: Word[] };
export type Timeline = {
  duration: number;
  engine: string;
  music: { enabled: boolean; volume: number };
  scenes: TimelineScene[];
};

export type Channel = { name: string; handle: string };

export type EpisodeProps = {
  episode: Episode;
  timeline: Timeline;
  channel: Channel;
  audio: { narration: string | null; ambient: string | null };
};

export type SceneProps<T extends Scene["template"]> = {
  scene: SceneOf<T>;
  duration: number; // em frames
  channel: Channel;
  episode: Episode;
};
