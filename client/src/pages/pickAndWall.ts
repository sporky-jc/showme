import { DisplayCollectionSentences } from "../config";
import type { GallerySentence } from "../api/types";

// Scribbles' pick and the wall of cards under it, from the sentences in the
// order showing. The wall is the first DisplayCollectionSentences, as before,
// and the pick comes from the ones after them, so it's never on the wall too.
// When every sentence fits on the wall, the pick is one of them, and the wall
// shows the rest. The pick starts as the first it could be, until "Show me
// another" chooses one (pickId).
export function pickAndWall(sentences: GallerySentence[], pickId: string | null) {
  const beyond = sentences.slice(DisplayCollectionSentences);
  const others = beyond.length > 0 ? beyond : sentences;
  const pick = others.find((sentence) => sentence._id === pickId) ?? others[0];
  const wall =
    beyond.length > 0
      ? sentences.slice(0, DisplayCollectionSentences)
      : sentences.filter((sentence) => sentence !== pick);
  return { pick, wall, others };
}

// One of these, at random
export const anyOf = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
