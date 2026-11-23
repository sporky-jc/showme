import { SENSE_KEYS, type SenseKey } from "../senses";
import type { Labeled } from "./senseSet";

// Scores a way of finding senses against a labeled set (test/senseSet.ts).
// For every sentence and sense:
// - found and labeled: right
// - found, not labeled: wrong (a sense lit up that isn't there)
// - labeled, not found: missed
// Recall is how many of the labeled senses are found; precision is how many
// of the senses lit up are right. Used by senseScore.test.ts (the word list)
// and scripts/measure-tagger.ts (the two AI models, Stage A4).

// For one sentence: each sense found, with the word that lit it, or null
export type Finder = (show: string) => Record<SenseKey, string | null>;

export type Score = {
  recall: number;
  precision: number;
  bySense: Record<SenseKey, { right: number; wrong: number; missed: number }>;
  mistakes: string[];
};

export function score(set: readonly Labeled[], find: Finder): Score {
  const bySense = Object.fromEntries(SENSE_KEYS.map((sense) => [sense, { right: 0, wrong: 0, missed: 0 }])) as Score["bySense"];
  const mistakes: string[] = [];
  for (const { show, senses } of set) {
    const found = find(show);
    for (const sense of SENSE_KEYS) {
      const lit = found[sense] !== null;
      const labeled = senses.includes(sense);
      if (lit && labeled) bySense[sense].right += 1;
      if (lit && !labeled) {
        bySense[sense].wrong += 1;
        mistakes.push(`lit ${sense} (${found[sense]}): ${show}`);
      }
      if (!lit && labeled) {
        bySense[sense].missed += 1;
        mistakes.push(`missed ${sense}: ${show}`);
      }
    }
  }
  const total = (key: "right" | "wrong" | "missed") => SENSE_KEYS.reduce((sum, sense) => sum + bySense[sense][key], 0);
  const right = total("right");
  return {
    recall: right / Math.max(1, right + total("missed")),
    precision: right / Math.max(1, right + total("wrong")),
    bySense,
    mistakes,
  };
}

export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
