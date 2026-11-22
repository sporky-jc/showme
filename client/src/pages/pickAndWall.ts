import { DisplayCollectionSentences } from "../config";
import type { GallerySentence } from "../api/types";

// Scribbles' pick and the wall of cards under it, from the sentences in the
// order showing. The wall is every sentence but the pick, in order; it shows
// DisplayCollectionSentences at first (Show more adds more). The pick comes
// from the ones after those first ones, so the first wall a visitor sees is
// the same as before the pick, and the pick is never on the wall too. When
// every sentence fits on the first wall, the pick is one of them. The pick
// starts as the first it could be, until "Show me another" chooses one
// (pickId).
export function pickAndWall(sentences: GallerySentence[], pickId: string | null) {
  const beyond = sentences.slice(DisplayCollectionSentences);
  const others = beyond.length > 0 ? beyond : sentences;
  const pick = others.find((sentence) => sentence._id === pickId) ?? others[0];
  const wall = sentences.filter((sentence) => sentence !== pick);
  return { pick, wall, others };
}

// One of these, at random
export const anyOf = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
