import { describe, expect, it } from "vitest";
import { SENSE_KEYS, type SenseKey } from "./senses";
import { score, type Finder } from "./test/senseScoring";
import { SENSE_HELD_OUT } from "./test/senseHeldOut";
import { SENSE_SET } from "./test/senseSet";
import { withMay } from "./test/senseMay";

// How a way of finding senses is scored (test/senseScoring.ts): a "must"
// sense found is right, missed is missed; a sense found that isn't there is
// wrong; a "may" sense (a judgment call, test/senseMay.ts) found or not
// counts for nothing either way.

const lights =
  (lit: Record<string, SenseKey[]>): Finder =>
  (show) =>
    Object.fromEntries(SENSE_KEYS.map((sense) => [sense, lit[show]?.includes(sense) ? "word" : null])) as ReturnType<Finder>;

const CHIPS = "The chips were salty and crunchy.";

describe("score", () => {
  it("counts a sense found that isn't there as wrong", () => {
    const result = score([{ show: CHIPS, senses: ["taste"] }], lights({ [CHIPS]: ["taste", "hear"] }));
    expect(result).toMatchObject({ recall: 1, precision: 0.5, allowed: 0 });
    expect(result.mistakes).toEqual([`lit hear (word): ${CHIPS}`]);
  });

  it("counts a may sense found as neither right nor wrong", () => {
    const result = score([{ show: CHIPS, senses: ["taste"], may: ["hear"] }], lights({ [CHIPS]: ["taste", "hear"] }));
    expect(result).toMatchObject({ recall: 1, precision: 1, allowed: 1, mistakes: [] });
  });

  it("doesn't count a may sense left out as missed", () => {
    const result = score([{ show: CHIPS, senses: ["taste"], may: ["hear"] }], lights({ [CHIPS]: ["taste"] }));
    expect(result).toMatchObject({ recall: 1, precision: 1, allowed: 0, mistakes: [] });
  });
});

describe("withMay", () => {
  it("adds each sentence's may senses, never one it must show", () => {
    expect(withMay([{ show: CHIPS, senses: ["taste"] }], { [CHIPS]: ["hear", "taste"] })).toEqual([
      { show: CHIPS, senses: ["taste"], may: ["hear"] },
    ]);
  });

  it("leaves a sentence with no may senses as it is", () => {
    expect(withMay([{ show: CHIPS, senses: ["taste"] }], {})).toEqual([{ show: CHIPS, senses: ["taste"] }]);
  });
});

describe("the held-out set", () => {
  it("has 40 sentences, some that only tell, none from the tuning set", () => {
    expect(SENSE_HELD_OUT).toHaveLength(40);
    expect(SENSE_HELD_OUT.filter(({ senses }) => senses.length === 0).length).toBeGreaterThanOrEqual(6);
    const tuning = new Set(SENSE_SET.map(({ show }) => show));
    expect(SENSE_HELD_OUT.filter(({ show }) => tuning.has(show))).toEqual([]);
    expect(new Set(SENSE_HELD_OUT.map(({ show }) => show)).size).toBe(40);
  });
});
