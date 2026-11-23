// The last accepted rules score on the practice set (score.ts). CI fails a
// pull request that scores worse. Written by `npm run score:rules -- --update`:
// raise it whenever the rules get better, and rescore it whenever the
// practice set changes.
import type { Score } from "./score.js";

export const BASELINE: Score = {
  worrying: 150,
  hold: 80,
  ok: 130,
  worryingCaught: 70,
  harmfulHeld: 120,
  falseHolds: 3
};
