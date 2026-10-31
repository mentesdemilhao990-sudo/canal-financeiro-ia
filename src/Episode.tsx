import React from "react";
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import type { EpisodeProps, Scene, SceneProps } from "./types";
import { ensureFonts } from "./fonts";
import { Background } from "./components/Background";
import { Header } from "./components/Header";
import { Captions } from "./components/Captions";
import { SceneShell } from "./components/SceneShell";
import { Hook } from "./scenes/Hook";
import { Split } from "./scenes/Split";
import { Counter } from "./scenes/Counter";
import { LineChart } from "./scenes/LineChart";
import { Bars } from "./scenes/Bars";
import { List } from "./scenes/List";
import { Outro } from "./scenes/Outro";
import { Divisoria, PainelLateral, PalcoHorizontal } from "./components/Landscape";

ensureFonts();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TEMPLATES: Record<Scene["template"], React.FC<SceneProps<any>>> = {
  hook: Hook,
  split: Split,
  counter: Counter,
  lineChart: LineChart,
  bars: Bars,
  list: List,
  outro: Outro,
};

export const EpisodeVideo: React.FC<EpisodeProps> = ({ episode, timeline, channel, audio }) => {
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const horizontal = width > height;
  const words = timeline.scenes.flatMap((s) => s.words);
  return (
    <AbsoluteFill style={{ backgroundColor: "#06080B" }}>
      <Background />
      {episode.scenes.map((scene, i) => {
        const t = timeline.scenes[i];
        const from = Math.round(t.start * fps);
        const to = i === episode.scenes.length - 1 ? durationInFrames : Math.round(t.end * fps);
        const Comp = TEMPLATES[scene.template];
        return (
          <Sequence key={scene.id} from={from} durationInFrames={Math.max(1, to - from)} name={`${i + 1}. ${scene.template}`}>
            {horizontal ? (
              <SceneShell duration={to - from}>
                <PainelLateral episode={episode} index={i} />
                <PalcoHorizontal duration={to - from}>
                  <Comp scene={scene} duration={to - from} channel={channel} episode={episode} />
                </PalcoHorizontal>
              </SceneShell>
            ) : (
              <SceneShell duration={to - from}>
                <Comp scene={scene} duration={to - from} channel={channel} episode={episode} />
              </SceneShell>
            )}
          </Sequence>
        );
      })}
      {horizontal && <Divisoria />}
      <Header name={channel.name} />
      <Captions words={words} />
      {audio.narration && <Html5Audio src={staticFile(audio.narration)} />}
      {audio.ambient && timeline.music.enabled && <Html5Audio src={staticFile(audio.ambient)} volume={timeline.music.volume} />}
    </AbsoluteFill>
  );
};
