import type { Technique } from "./api/types";

// The explainer films: half a minute each, made in the showme-films repo
// (github.com/sporky-jc/showme-films) and copied into public/films/<name>/
// as a small video, its captions and the picture shown before it plays.
// A refresher with a film here offers it on its first step (Refresher.tsx),
// and the Films page (pages/Films.tsx) lists them all.
// Adding a film means adding its three files and a line here, not code.

export interface Film {
  // What it's called, for the play button
  title: string;
  seconds: number;
  video: string;
  captions: string;
  poster: string;
  // A smaller copy of the picture, for the Films page's cards
  smallPoster: string;
}

const film = (name: string, title: string, seconds: number): Film => ({
  title,
  seconds,
  video: `/films/${name}/${name}.mp4`,
  captions: `/films/${name}/${name}.vtt`,
  poster: `/films/${name}/poster.jpg`,
  smallPoster: `/films/${name}/poster-small.jpg`,
});

export const FILMS: Partial<Record<Technique, Film>> = {
  senses: film("senses", "Show it with your senses", 34),
  simile: film("simile", "The simile film", 30),
  metaphor: film("metaphor", "The metaphor film", 33),
  personification: film("personification", "The personification film", 34),
  onomatopoeia: film("onomatopoeia", "The onomatopoeia film", 33),
  hyperbole: film("hyperbole", "The hyperbole film", 33),
  alliteration: film("alliteration", "The alliteration film", 35),
  allusion: film("allusion", "The allusion film", 37),
};
