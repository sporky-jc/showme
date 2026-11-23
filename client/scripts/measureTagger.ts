// The sense tagger's weekly measure (Stage A4 of tasks/sense-words-plan.md):
// how the two AI models do on the made-up labeled set (src/test/senseSet.ts),
// never on real students' writing. scripts/measure-tagger.ts runs it; this is
// its arithmetic, tested in src/measureTagger.test.ts.
import { SENSE_KEYS, type SenseKey, type SenseTag, senseWords } from "../src/senses";
import type { Finder, Score } from "../src/test/senseScoring";
import { percent } from "../src/test/senseScoring";

// Senses found by the AI tags alone (no word list)
export const tagsOnly =
  (tagsFor: Map<string, readonly SenseTag[]>): Finder =>
  (show) => {
    const found = Object.fromEntries(SENSE_KEYS.map((sense) => [sense, null])) as Record<SenseKey, string | null>;
    for (const { word, sense } of tagsFor.get(show) ?? []) found[sense] ??= word;
    return found;
  };

// What the Gallery lights up: the word list, with the AI tags winning
export const gallery =
  (tagsFor: Map<string, readonly SenseTag[]>): Finder =>
  (show) =>
    senseWords(show, tagsFor.get(show));

// How often the two models name the same words with the same sense: of the
// words either one named, how many both named alike
export type Agreement = { agreed: number; differentSense: number; onlyOne: number };

export function agreement(first: Map<string, SenseKey>, second: Map<string, SenseKey>): Agreement {
  const words = new Set([...first.keys(), ...second.keys()]);
  let agreed = 0;
  let differentSense = 0;
  let onlyOne = 0;
  for (const word of words) {
    const a = first.get(word);
    const b = second.get(word);
    if (a && b) {
      if (a === b) agreed += 1;
      else differentSense += 1;
    } else onlyOne += 1;
  }
  return { agreed, differentSense, onlyOne };
}

export const addAgreement = (a: Agreement, b: Agreement): Agreement => ({
  agreed: a.agreed + b.agreed,
  differentSense: a.differentSense + b.differentSense,
  onlyOne: a.onlyOne + b.onlyOne,
});

// Ready for production when the Gallery, with the AI tags, finds more than
// the word list alone and is right at least as often
export const ready = (list: Score, withTags: Score) => withTags.recall > list.recall && withTags.precision >= list.precision;

export function report({
  sentences,
  list,
  aiOnly,
  withTags,
  agreed,
  unreadable,
  neurons,
}: {
  sentences: number;
  list: Score;
  aiOnly: Score;
  withTags: Score;
  agreed: Agreement;
  unreadable: number;
  neurons: number;
}): string {
  const named = agreed.agreed + agreed.differentSense + agreed.onlyOne;
  const row = (name: string, s: Score) => `| ${name} | ${percent(s.recall)} | ${percent(s.precision)} |`;
  return [
    `## Sense tagger: ${sentences} made-up sentences`,
    "",
    "| Highlights from | Found (recall) | Right (precision) |",
    "|---|---|---|",
    row("Word list alone (today without AI)", list),
    row("The two AIs' agreed words alone", aiOnly),
    row("**Gallery: word list + agreed words**", withTags),
    "",
    `- **The two AIs agreed** on ${agreed.agreed} of the ${named} words either named (${percent(agreed.agreed / Math.max(1, named))}); ${agreed.differentSense} got different senses, and ${agreed.onlyOne} only one named.`,
    `- **Unreadable answers:** ${unreadable} of ${sentences} sentences.`,
    `- **Neurons used:** about ${Math.round(neurons)} of the 10,000 free a day.`,
    "",
    ready(list, withTags)
      ? "**Ready for production:** the Gallery finds more senses with the AI than without it, and is right at least as often."
      : "**Not ready for production yet:** with the AI, the Gallery must find more senses than the word list alone and be right at least as often.",
    "",
    "<details><summary>The Gallery's mistakes, with the AI (made-up sentences)</summary>",
    "",
    ...withTags.mistakes.map((mistake) => `- ${mistake}`),
    "",
    "</details>",
  ].join("\n");
}
