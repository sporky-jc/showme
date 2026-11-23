import { SENSE_KEYS, type SenseKey } from "../senses";
import type { Labeled } from "./senseSet";
import { SENSE_MAY } from "./senseMay";

// Scores a way of finding senses against a labeled set (test/senseSet.ts,
// test/senseHeldOut.ts). For every sentence and sense:
// - found and labeled: right
// - found, not labeled: wrong (a sense lit up that isn't there)
// - labeled, not found: missed
// - a "may" sense (a judgment call, test/senseMay.ts), found or not: neither
//   right nor wrong, so a defensible extra isn't counted as a mistake, and
//   isn't counted as a find either (`allowed` says how many)
// Recall is how many of the labeled senses are found; precision is how many
// of the senses lit up are right. Used by senseScore.test.ts (the word list)
// and scripts/measure-tagger.ts (the two AI models, Stage A4).

// For one sentence: each sense found, with the word that lit it, or null
export type Finder = (show: string) => Record<SenseKey, string | null>;

export type Score = {
  recall: number;
  precision: number;
  bySense: Record<SenseKey, { right: number; wrong: number; missed: number }>;
  // May senses found: not counted either way
  allowed: number;
  mistakes: string[];
};

export function score(set: readonly Labeled[], find: Finder): Score {
  const bySense = Object.fromEntries(SENSE_KEYS.map((sense) => [sense, { right: 0, wrong: 0, missed: 0 }])) as Score["bySense"];
  const mistakes: string[] = [];
  let allowed = 0;
  for (const { show, senses, may = [] } of set) {
    const found = find(show);
    for (const sense of SENSE_KEYS) {
      const lit = found[sense] !== null;
      const labeled = senses.includes(sense);
      if (!labeled && may.includes(sense)) {
        if (lit) allowed += 1;
        continue;
      }
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
    allowed,
    mistakes,
  };
}

export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

// A practice set with its may senses (never one a sentence must show)
export const withMay = (set: readonly Labeled[], may: Readonly<Record<string, readonly SenseKey[]>> = SENSE_MAY): Labeled[] =>
  set.map((labeled) => {
    const extra = (may[labeled.show] ?? []).filter((sense) => !labeled.senses.includes(sense));
    return extra.length ? { ...labeled, may: extra } : labeled;
  });
