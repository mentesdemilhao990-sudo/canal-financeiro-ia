import React from "react";
import { Composition, Still, type CalculateMetadataFunction } from "remotion";
import { EpisodeVideo } from "./Episode";
import { Cover } from "./Cover";
import { FPS, HEIGHT, WIDTH } from "./theme";
import type { EpisodeProps } from "./types";
import { parseEpisode } from "./lib/schema.mjs";
import { estimateTimeline } from "./lib/estimate.mjs";
import sample from "../episodes/guardar-nao-e-investir.json";
import channel from "../config/channel.json";

// Valores para pré-visualizar no Remotion Studio (sem narração). A renderização real recebe props do script.
const episode = parseEpisode(sample);
const defaultProps: EpisodeProps = {
  episode,
  timeline: estimateTimeline(episode),
  channel: { name: channel.name, handle: channel.handle },
  audio: { narration: null, ambient: null },
};

const calculateMetadata: CalculateMetadataFunction<EpisodeProps> = ({ props }) => ({
  durationInFrames: Math.ceil(props.timeline.duration * FPS),
});

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Episode"
      component={EpisodeVideo}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={FPS * 40}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
    />
    <Still id="Cover" component={Cover} width={WIDTH} height={HEIGHT} defaultProps={defaultProps} />
  </>
);
