import { describe, expect, it } from "vitest";
import { LABEL_INSTRUCTIONS } from "../../backend/tagger/senseTags";
import { SENSE_SET } from "./test/senseSet";
import { SENSE_HELD_OUT } from "./test/senseHeldOut";

// The tagger's worked examples (backend/tagger/senseTags.ts) must never be
// practice sentences (test/senseSet.ts, test/senseHeldOut.ts): the measure
// would then score the tagger on answers it was shown.

const examples = () =>
  [...LABEL_INSTRUCTIONS.split("Examples:")[1].matchAll(/^- "([^"]+)"/gm)].map(([, sentence]) => sentence);

// Small words every sentence shares don't make two sentences alike
const SMALL = new Set("a an the and or but so of to in on at by for with off up was were is are it its my our her his their i we gave had".split(" "));
const words = (text: string) => new Set((text.toLowerCase().match(/[a-z']+/g) ?? []).filter((word) => !SMALL.has(word)));

describe("the tagger's worked examples", () => {
  it("are there", () => {
    expect(examples().length).toBeGreaterThanOrEqual(3);
  });

  it("aren't practice sentences, or close to one", () => {
    for (const example of examples()) {
      const exampleWords = words(example);
      for (const { show } of [...SENSE_SET, ...SENSE_HELD_OUT]) {
        // Close: most of the example's own words are in the practice sentence
        const shared = [...exampleWords].filter((word) => words(show).has(word)).length;
        expect(shared / exampleWords.size, `"${example}" is close to "${show}"`).toBeLessThan(0.6);
      }
    }
  });
});
