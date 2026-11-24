import type { Technique } from "./api/types";

// The explainer films: half a minute each, made in the showme-films repo
// (github.com/sporky-jc/showme-films) and copied into public/films/<name>/
// as a small video, its captions and the picture shown before it plays.
// A refresher with a film here offers it on its first step (Refresher.tsx).
// Adding a film means adding its three files and a line here, not code.

export interface Film {
  // What it's called, for the play button
  title: string;
  seconds: number;
  video: string;
  captions: string;
  poster: string;
}

const film = (name: string, title: string, seconds: number): Film => ({
  title,
  seconds,
  video: `/films/${name}/${name}.mp4`,
  captions: `/films/${name}/${name}.vtt`,
  poster: `/films/${name}/poster.jpg`,
});

export const FILMS: Partial<Record<Technique, Film>> = {
  senses: film("senses", "Show it with your senses", 34),
};
