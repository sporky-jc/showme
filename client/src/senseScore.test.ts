import { describe, expect, it } from "vitest";
import { SENSE_KEYS, type SenseKey, senseWords } from "./senses";
import { SENSE_SET } from "./test/senseSet";

// How well the sense words do on a made-up test set (S2 of
// tasks/sense-words-plan.md). Each sentence has the senses a teacher would see
// in it. For every sentence and sense:
// - found and labeled: right
// - found, not labeled: wrong (the list lit up a sense that isn't there)
// - labeled, not found: missed
// Recall is how many of the labeled senses the list finds; precision is how
// many of the senses it lights up are right.
//
// The floors below are the scores when they were last raised. The test fails
// if either drops, so a change can't quietly make the list worse. When a
// change makes them better, raise the floors to the new scores. See the
// report, with every mistake, with: npx vitest run senseScore --silent=false
const RECALL_AT_LEAST = 0.842;
const PRECISION_AT_LEAST = 0.93;

function score() {
  let right = 0;
  let wrong = 0;
  let missed = 0;
  const bySense = Object.fromEntries(SENSE_KEYS.map((sense) => [sense, { right: 0, wrong: 0, missed: 0 }])) as Record<
    SenseKey,
    { right: number; wrong: number; missed: number }
  >;
  const mistakes: string[] = [];
  for (const { show, senses } of SENSE_SET) {
    const found = senseWords(show);
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
  for (const sense of SENSE_KEYS) {
    right += bySense[sense].right;
    wrong += bySense[sense].wrong;
    missed += bySense[sense].missed;
  }
  return {
    recall: right / (right + missed),
    precision: right / (right + wrong),
    bySense,
    mistakes,
  };
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

describe("sense word score", () => {
  it("has about 100 sentences, some that only tell", () => {
    expect(SENSE_SET.length).toBeGreaterThanOrEqual(95);
    expect(SENSE_SET.filter(({ senses }) => senses.length === 0).length).toBeGreaterThanOrEqual(15);
  });

  it("finds as many senses as before, and is wrong no more often", () => {
    const { recall, precision, bySense, mistakes } = score();
    // The report, for anyone changing the list
    console.info(
      [
        `Sense words: recall ${percent(recall)} (floor ${percent(RECALL_AT_LEAST)}), ` +
          `precision ${percent(precision)} (floor ${percent(PRECISION_AT_LEAST)})`,
        ...SENSE_KEYS.map(
          (sense) =>
            `  ${sense}: ${bySense[sense].right} right, ${bySense[sense].wrong} wrong, ${bySense[sense].missed} missed`
        ),
        ...mistakes.map((mistake) => `  ${mistake}`),
      ].join("\n")
    );
    expect(recall).toBeGreaterThanOrEqual(RECALL_AT_LEAST);
    expect(precision).toBeGreaterThanOrEqual(PRECISION_AT_LEAST);
  });
});
