import { describe, expect, it } from "vitest";
import { addAgreement, agreement, gallery, ready, report, tagsOnly } from "../scripts/measureTagger";
import { score } from "./test/senseScoring";
import type { Labeled } from "./test/senseSet";
import type { SenseKey } from "./senses";

// The sense tagger's measure (Stage A4): its arithmetic, with made-up tags

const set: Labeled[] = [
  { show: "Wind wailed all night.", senses: ["hear"] },
  { show: "The roses had a sweet perfume.", senses: ["smell"] },
  { show: "She was very happy.", senses: [] },
];
const tags = new Map([
  ["Wind wailed all night.", [{ word: "wailed", sense: "hear" as const }]],
  ["The roses had a sweet perfume.", [{ word: "sweet", sense: "smell" as const }]],
]);
const answers = (entries: [string, SenseKey][]) => new Map(entries);

describe("the tagger's measure", () => {
  it("scores the AI tags alone, and the Gallery's word list with them", () => {
    expect(score(set, tagsOnly(tags))).toMatchObject({ recall: 1, precision: 1 });
    // The word list lights "sweet" as a taste; with the tag, it's a smell
    const list = score(set, gallery(new Map()));
    const withTags = score(set, gallery(tags));
    expect(list.mistakes).toContain("lit taste (sweet): The roses had a sweet perfume.");
    expect(withTags).toMatchObject({ recall: 1, precision: 1 });
    expect(ready(list, withTags)).toBe(true);
  });

  it("counts how often the two models name the same words alike", () => {
    const first = answers([["wailed", "hear"], ["bark", "feel"], ["rough", "feel"]]);
    const second = answers([["wailed", "hear"], ["bark", "see"], ["trees", "see"]]);
    expect(agreement(first, second)).toEqual({ agreed: 1, differentSense: 1, onlyOne: 2 });
    expect(addAgreement({ agreed: 1, differentSense: 1, onlyOne: 2 }, { agreed: 3, differentSense: 0, onlyOne: 1 })).toEqual({
      agreed: 4,
      differentSense: 1,
      onlyOne: 3,
    });
  });

  it("isn't ready when the AI makes the Gallery wrong more often", () => {
    const list = { recall: 0.84, precision: 0.93, bySense: {} as never, mistakes: [] };
    expect(ready(list, { ...list, recall: 0.9, precision: 0.9 })).toBe(false);
    expect(ready(list, { ...list, recall: 0.84, precision: 0.95 })).toBe(false);
  });

  it("reports the three scores, the agreement, unreadable answers and Neurons", () => {
    const text = report({
      sentences: 3,
      list: score(set, gallery(new Map())),
      aiOnly: score(set, tagsOnly(tags)),
      withTags: score(set, gallery(tags)),
      agreed: { agreed: 2, differentSense: 1, onlyOne: 1 },
      unreadable: 0,
      neurons: 90.4,
    });
    expect(text).toContain("| **Gallery: word list + agreed words** | 100.0% | 100.0% |");
    expect(text).toContain("agreed** on 2 of the 4 words either named (50.0%)");
    expect(text).toContain("about 90 of the 10,000 free a day");
    expect(text).toContain("**Ready for production:**");
  });
});
