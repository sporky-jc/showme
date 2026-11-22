import { describe, expect, it } from "vitest";
import {
  type Added,
  type Answer,
  MAX_NEW_WORDS,
  addedFile,
  baseOf,
  chunks,
  isBlocked,
  isOutOfNeurons,
  neurons,
  MODELS,
  newWords,
  readAnswers,
  report,
  rounded,
  trusted,
  withWords,
  wordsToAsk,
} from "../scripts/senseWordJob";
import { ADDED_SENSE_WORDS } from "./senseWordsAdded";

// The weekly sense word job (S3 of tasks/sense-words-plan.md): which words
// it asks the AI about, which answers it trusts, what goes in the file, and
// the report

const none: Added = {
  see: { exact: [], words: [], describing: [] },
  hear: { exact: [], words: [], describing: [] },
  feel: { exact: [], words: [], describing: [] },
  smell: { exact: [], words: [], describing: [] },
  taste: { exact: [], words: [], describing: [] },
};

const answers = (...list: Answer[]) => new Map(list.map((answer) => [answer.word, answer]));

describe("blocked words", () => {
  it("blocks NEVER_ADD words, the telling words and feelings, in every form", () => {
    for (const word of ["light", "lights", "lighting", "feeling", "feelings", "delicious", "gross", "proud", "nervously", "lonely"]) {
      expect([word, isBlocked(word)]).toEqual([word, true]);
    }
  });

  it("blocks a base when a form of it is listed, either way round", () => {
    // "feeling" is in NEVER_ADD: its base "feel" can't be added either
    expect(isBlocked("feel")).toBe(true);
  });

  it("doesn't block ordinary sense words", () => {
    for (const word of ["stench", "wailed", "frigid", "roaring"]) expect([word, isBlocked(word)]).toEqual([word, false]);
  });
});

describe("wordsToAsk", () => {
  it("asks only about words the list doesn't find, leaving out everyday and blocked words", () => {
    const asked = wordsToAsk([
      { word: "stench", sentences: 9 },
      { word: "screaming", sentences: 8 }, // the list finds it
      { word: "the", sentences: 50 }, // everyday
      { word: "lights", sentences: 6 }, // a form of a NEVER_ADD word
      { word: "delicious", sentences: 6 }, // telling
      { word: "frigid", sentences: 3 },
    ]).map(({ word }) => word);
    expect(asked).toEqual(["stench", "frigid"]);
  });
});

describe("readAnswers", () => {
  it("keeps well-formed answers about words it asked about", () => {
    const text = JSON.stringify({
      answers: [
        { word: "Stench", sense: "smell", kind: "doing", base: "stench" },
        { word: "stench", sense: "see", kind: "doing" }, // a second answer: the first counts
        { word: "frigid", sense: "touch", kind: "describing" }, // not a sense key
        { word: "banana", sense: "taste", kind: "doing" }, // not asked
        { word: "wailed", sense: "hear" },
      ],
    });
    expect([...readAnswers(text, ["stench", "frigid", "wailed"]).values()]).toEqual([
      { word: "stench", sense: "smell", kind: "doing", base: "stench" },
      { word: "wailed", sense: "hear", kind: undefined, base: undefined },
    ]);
  });

  it("reads JSON leniently, for a model told to answer in JSON in its prompt", () => {
    const fenced = 'Here you go:\n```json\n{"answers": [{"word": "wailed", "sense": "hear"}]}\n```';
    expect(readAnswers(fenced, ["wailed"]).get("wailed")?.sense).toBe("hear");
  });

  it("is empty for an answer it can't read", () => {
    expect(readAnswers("not json", ["stench"]).size).toBe(0);
    expect(readAnswers(null, ["stench"]).size).toBe(0);
    expect(readAnswers({ answers: "smell" }, ["stench"]).size).toBe(0);
  });
});

describe("baseOf", () => {
  it("takes the AI's base when the list's spelling rules say the word is a form of it", () => {
    expect(baseOf("wailed", "doing", "wail")).toBe("wail");
    expect(baseOf("frigidly", "describing", "frigid")).toBe("frigid");
  });

  it("keeps the word as written otherwise", () => {
    expect(baseOf("wailed", "doing", "banana")).toBe("wailed");
    expect(baseOf("louder", "doing", "loud")).toBe("louder"); // -er is for describing words
    expect(baseOf("stench", "doing", undefined)).toBe("stench");
  });
});

describe("trusted", () => {
  it("trusts a word only when both models give the same sense, with a kind", () => {
    const counts = [
      { word: "stench", sentences: 5 },
      { word: "frigid", sentences: 4 },
      { word: "cozy", sentences: 3 },
    ];
    const first = answers(
      { word: "stench", sense: "smell", kind: "doing", base: "stench" },
      { word: "frigid", sense: "feel", kind: "describing", base: "frigid" },
      { word: "cozy", sense: "feel" } // no kind
    );
    const second = answers({ word: "stench", sense: "smell" }, { word: "frigid", sense: "see" }, { word: "cozy", sense: "feel" });
    expect(trusted(counts, first, second)).toEqual([
      { word: "stench", written: "stench", sense: "smell", kind: "doing", how: "family", sentences: 5 },
    ]);
  });

  it("adds the whole family only when the bare base passed too, and the exact word otherwise", () => {
    const counts = [
      { word: "wailed", sentences: 5 },
      { word: "wail", sentences: 3 },
      { word: "barked", sentences: 4 }, // no bare "bark" in kids' sentences
    ];
    const first = answers(
      { word: "wailed", sense: "hear", kind: "doing", base: "wail" },
      { word: "wail", sense: "hear", kind: "doing", base: "wail" },
      { word: "barked", sense: "hear", kind: "doing", base: "bark" }
    );
    const second = answers({ word: "wailed", sense: "hear" }, { word: "wail", sense: "hear" }, { word: "barked", sense: "hear" });
    const found = trusted(counts, first, second);
    expect(found).toContainEqual({ word: "wail", written: "wailed", sense: "hear", kind: "doing", how: "family", sentences: 5 });
    expect(found).toContainEqual({ word: "barked", written: "barked", sense: "hear", kind: "doing", how: "exact", sentences: 4 });
  });

  it("never trusts a word whose base is blocked", () => {
    const first = answers({ word: "lighted", sense: "see", kind: "doing", base: "light" });
    expect(trusted([{ word: "lighted", sentences: 5 }], first, answers({ word: "lighted", sense: "see" }))).toEqual([]);
  });
});

describe("the added words file", () => {
  const word = (w: string, sentences: number) =>
    ({ word: w, written: w, sense: "hear", kind: "doing", how: "family", sentences }) as const;

  it("adds each word to its sense's exact, doing or describing words, sorted, once", () => {
    const added = withWords({ ...none, smell: { exact: [], words: ["whiff"], describing: [] } }, [
      { word: "stench", written: "stench", sense: "smell", kind: "doing", how: "family", sentences: 5 },
      { word: "frigid", written: "frigid", sense: "feel", kind: "describing", how: "family", sentences: 3 },
      { word: "barked", written: "barked", sense: "hear", kind: "doing", how: "exact", sentences: 4 },
      { word: "stench", written: "stench", sense: "smell", kind: "doing", how: "family", sentences: 5 },
    ]);
    expect(added.smell.words).toEqual(["stench", "whiff"]);
    expect(added.feel.describing).toEqual(["frigid"]);
    expect(added.hear.exact).toEqual(["barked"]);
  });

  it(`adds at most ${MAX_NEW_WORDS} new words a run, the most used first`, () => {
    const added = withWords(none, ["a1", "a2", "a3", "a4", "a5", "a6", "a7"].map((w, i) => word(`roar${w}`, 3 + i)));
    expect(added.hear.words).toHaveLength(MAX_NEW_WORDS);
    expect(added.hear.words).not.toContain("roara1");
    expect(added.hear.words).toContain("roara7");
  });

  it("takes out any word now blocked, which newWords reports as removed", () => {
    const before = { ...none, see: { exact: [], words: ["light", "glint"], describing: [] } };
    const after = withWords(before, []);
    expect(after.see.words).toEqual(["glint"]);
    expect(newWords(after, before)).toEqual(["see:light"]);
  });

  it("writes one word per line, in a file the sense list reads", () => {
    const file = addedFile("// header\n", withWords(none, [word("wail", 5)]));
    expect(file).toContain("// header\nexport const ADDED_SENSE_WORDS");
    expect(file).toContain('  hear: {\n    exact: [],\n    words: [\n      "wail",\n    ],\n    describing: [],\n  },');
  });

  it("starts empty, with every sense's three lists", () => {
    for (const lists of Object.values(ADDED_SENSE_WORDS)) {
      expect(Object.keys(lists)).toEqual(["exact", "words", "describing"]);
    }
  });
});

describe("the report", () => {
  const sentence = "Our dog wailed all night when the thunder came.";

  it("lists the added words with rounded counts, and the left out and removed ones", () => {
    const text = report(
      [{ word: "wail", written: "wailed", sense: "hear", kind: "doing", how: "family", sentences: 7 }],
      [{ word: "frigid", written: "frigid", sense: "feel", kind: "describing", how: "family", sentences: 3 }],
      ["light"],
      40,
      "staging"
    );
    expect(text).toContain("asked the free AI about 40 words from approved sentences in staging");
    expect(text).toContain("| wail (from wailed) | hear | doing, with its family | 6-10 |");
    expect(text).toContain("| frigid | feel | describing, with its family | 3-5 |");
    expect(text).toContain("Removed, because they're now in `NEVER_ADD`: light.");
    // Words and rounded counts only: never a sentence, never an exact count
    expect(text).not.toContain(sentence);
    expect(text).not.toMatch(/\| 7 \|/);
  });

  it("rounds counts so a report never points at one kid's writing", () => {
    expect([3, 5, 6, 10, 11].map(rounded)).toEqual(["3-5", "3-5", "6-10", "6-10", "more than 10"]);
  });
});

describe("the AI calls", () => {
  it("splits the words into requests", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("counts Neurons from the tokens Workers AI reports", () => {
    expect(neurons(MODELS.first, { prompt_tokens: 1_000_000, completion_tokens: 0 })).toBe(26_668);
    expect(neurons(MODELS.second, { prompt_tokens: 0, completion_tokens: 1_000_000 })).toBe(50_488);
    expect(neurons(MODELS.first, undefined)).toBe(0);
  });

  it("knows when the day's free Neurons have run out", () => {
    expect(isOutOfNeurons({ errors: [{ code: 3036, message: "x" }] })).toBe(true);
    expect(isOutOfNeurons({ errors: [{ code: 1, message: "You have used up your daily free allocation of 10,000 neurons" }] })).toBe(true);
    expect(isOutOfNeurons({ errors: [{ code: 7000, message: "No route" }] })).toBe(false);
  });

  it("uses two different model families", () => {
    expect(MODELS.first.name.split("/")[1]).not.toBe(MODELS.second.name.split("/")[1]);
  });
});
