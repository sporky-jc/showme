import { describe, expect, it } from "vitest";
import {
  type Added,
  type Answer,
  addedFile,
  baseOf,
  chunks,
  readAnswers,
  report,
  trusted,
  withWords,
  wordsToAsk,
} from "../scripts/senseWordJob";
import { senseWords } from "./senses";

// The weekly sense word job (S3 of tasks/sense-words-plan.md): which words
// it asks the AI about, which answers it trusts, and the file it writes

const none: Added = {
  see: { words: [], describing: [] },
  hear: { words: [], describing: [] },
  feel: { words: [], describing: [] },
  smell: { words: [], describing: [] },
  taste: { words: [], describing: [] },
};

const answers = (...list: Answer[]) => new Map(list.map((answer) => [answer.word, answer]));

describe("wordsToAsk", () => {
  it("asks only about words the list doesn't find, leaving out everyday and ruled-out words", () => {
    const asked = wordsToAsk([
      { word: "stench", sentences: 9 },
      { word: "screaming", sentences: 8 }, // the list finds it
      { word: "the", sentences: 50 }, // everyday
      { word: "light", sentences: 6 }, // NEVER_ADD
      { word: "frigid", sentences: 3 },
    ]).map(({ word }) => word);
    expect(asked).toEqual(["stench", "frigid"]);
  });
});

describe("readAnswers", () => {
  it("keeps well-formed answers about words it asked about, as JSON text or an object", () => {
    const text = JSON.stringify({
      answers: [
        { word: "Stench", sense: "smell", kind: "doing" },
        { word: "stench", sense: "see", kind: "doing" }, // a second answer: the first counts
        { word: "frigid", sense: "touch", kind: "describing" }, // not a sense key
        { word: "banana", sense: "taste", kind: "doing" }, // not asked
        { word: "wailed", sense: "hear" },
      ],
    });
    const read = readAnswers(text, ["stench", "frigid", "wailed"]);
    expect([...read.values()]).toEqual([
      { word: "stench", sense: "smell", kind: "doing", base: undefined },
      { word: "wailed", sense: "hear", kind: undefined, base: undefined },
    ]);
    expect(readAnswers({ answers: [{ word: "wailed", sense: "none" }] }, ["wailed"]).get("wailed")?.sense).toBe("none");
  });

  it("is empty for an answer it can't read", () => {
    expect(readAnswers("not json", ["stench"]).size).toBe(0);
    expect(readAnswers(null, ["stench"]).size).toBe(0);
    expect(readAnswers({ answers: "smell" }, ["stench"]).size).toBe(0);
  });
});

describe("trusted", () => {
  const counts = [
    { word: "stench", sentences: 5 },
    { word: "wailed", sentences: 4 },
    { word: "frigid", sentences: 3 },
    { word: "proud", sentences: 3 },
    { word: "cozy", sentences: 3 },
  ];

  it("trusts a word only when both ways of asking give the same sense, with a kind", () => {
    const first = answers(
      { word: "stench", sense: "smell", kind: "doing" },
      { word: "wailed", sense: "hear", kind: "doing" },
      { word: "frigid", sense: "feel", kind: "describing" },
      { word: "proud", sense: "none", kind: "describing" },
      { word: "cozy", sense: "feel" } // no kind
    );
    const second = answers(
      { word: "stench", sense: "smell" },
      { word: "wailed", sense: "see" }, // disagrees
      { word: "frigid", sense: "feel" },
      { word: "proud", sense: "none" },
      { word: "cozy", sense: "feel" }
    );
    expect(trusted(counts, first, second)).toEqual([
      { word: "stench", sense: "smell", kind: "doing", sentences: 5 },
      { word: "frigid", sense: "feel", kind: "describing", sentences: 3 },
    ]);
  });

  it("trusts nothing a second answer is missing for", () => {
    const first = answers({ word: "stench", sense: "smell", kind: "doing" });
    expect(trusted(counts, first, new Map())).toEqual([]);
  });
});

describe("baseOf", () => {
  it("adds the AI's base when the list's spelling rules say the word is a form of it", () => {
    expect(baseOf("wailed", "doing", "wail")).toBe("wail");
    expect(baseOf("crashes", "doing", "crash")).toBe("crash");
    expect(baseOf("frigidly", "describing", "frigid")).toBe("frigid");
  });

  it("keeps the word as written when the base isn't one of its forms", () => {
    expect(baseOf("wailed", "doing", "banana")).toBe("wailed");
    expect(baseOf("louder", "doing", "loud")).toBe("louder"); // -er is for describing words
    expect(baseOf("stench", "doing", undefined)).toBe("stench");
  });

  it("is what a trusted word is added as, with the word as written", () => {
    const first = answers({ word: "wailed", sense: "hear", kind: "doing", base: "wail" });
    const second = answers({ word: "wailed", sense: "hear" });
    expect(trusted([{ word: "wailed", sentences: 4 }], first, second)).toEqual([
      { word: "wail", written: "wailed", sense: "hear", kind: "doing", sentences: 4 },
    ]);
  });
});

describe("the added words file", () => {
  it("adds each word to its sense's doing or describing words, sorted, once", () => {
    const added = withWords(
      { ...none, smell: { words: ["whiff"], describing: [] } },
      [
        { word: "stench", sense: "smell", kind: "doing", sentences: 5 },
        { word: "frigid", sense: "feel", kind: "describing", sentences: 3 },
        { word: "stench", sense: "smell", kind: "doing", sentences: 5 },
      ]
    );
    expect(added.smell.words).toEqual(["stench", "whiff"]);
    expect(added.feel.describing).toEqual(["frigid"]);
  });

  it("writes a file the sense list reads", () => {
    const file = addedFile("// header\n", withWords(none, [{ word: "stench", sense: "smell", kind: "doing", sentences: 5 }]));
    expect(file).toContain("// header\nexport const ADDED_SENSE_WORDS");
    expect(file).toContain('smell: { words: ["stench"], describing: [] },');
  });

  it("is what the list uses: an added doing word comes with its family", async () => {
    // The real file starts empty; the list merges it (see senses.ts)
    const { ADDED_SENSE_WORDS } = await import("./senseWordsAdded");
    expect(Object.values(ADDED_SENSE_WORDS).every(({ words, describing }) => Array.isArray(words) && Array.isArray(describing))).toBe(true);
    expect(senseWords("A stench filled the hall").smell).toBe(
      ADDED_SENSE_WORDS.smell.words.includes("stench") ? "stench" : null
    );
  });
});

describe("chunks and the report", () => {
  it("splits the words into requests", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("lists the added words, and any left out", () => {
    const text = report(
      [{ word: "stench", sense: "smell", kind: "doing", sentences: 5 }],
      [{ word: "frigid", sense: "feel", kind: "describing", sentences: 3 }],
      40,
      "staging"
    );
    expect(text).toContain("asked the free AI about 40 words from approved sentences in staging");
    expect(text).toContain("| stench | smell | doing | 5 |");
    expect(text).toContain("Left out, because a sense test failed with them:");
    expect(text).toContain("| frigid | feel | describing | 3 |");
  });
});
