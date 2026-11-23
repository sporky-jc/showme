import { describe, expect, it } from "vitest";
import { JUDGES, answerText, judgeMessage, mayFile, mergeMay, readVerdicts, sensesToAsk, unanimous } from "../scripts/judgeSenseSets";

// The judge panel that decides the practice sets' may senses
// (scripts/judgeSenseSets.ts): with stand-in answers, no real request.

describe("the judges", () => {
  it("are three AI families, none of them the tagger's", () => {
    const families = JUDGES.map(({ name }) => name.split("/")[1]);
    expect(new Set(families).size).toBe(3);
    expect(families).not.toContain("meta");
    expect(families).not.toContain("mistralai");
  });
});

describe("sensesToAsk", () => {
  it("is every sense the sentence's labels leave out", () => {
    expect(sensesToAsk(["taste"])).toEqual(["see", "hear", "feel", "smell"]);
    expect(sensesToAsk([])).toEqual(["see", "hear", "feel", "smell", "taste"]);
  });
});

describe("judgeMessage", () => {
  it("gives the sentence, what it clearly shows, and the senses to judge", () => {
    expect(judgeMessage("The chips were salty and crunchy.", ["taste"], ["hear", "see"])).toBe(
      "Sentence: The chips were salty and crunchy.\nIt clearly shows: taste\nJudge these senses: hear, see"
    );
    expect(judgeMessage("The game was fun.", [], ["see"])).toContain("It clearly shows: none");
  });
});

describe("answerText", () => {
  it("finds the answer in each shape Workers AI models answer in", () => {
    expect(answerText({ response: '{"answers": []}' })).toBe('{"answers": []}');
    expect(answerText({ response: { answers: [] } })).toBe('{"answers":[]}');
    expect(answerText({ choices: [{ message: { content: "<think>hmm</think> {\"answers\": []}" } }] })).toBe('{"answers": []}');
    expect(answerText({ output_text: '{"answers": []}' })).toBe('{"answers": []}');
    expect(
      answerText({ output: [{ type: "reasoning", content: [{ text: "thinking" }] }, { type: "message", content: [{ text: '{"answers": []}' }] }] })
    ).toBe('{"answers": []}');
    expect(answerText(null)).toBe("");
  });
});

describe("readVerdicts", () => {
  const ASKED = ["hear", "see"] as const;

  it("reads a yes or no for each asked sense, leniently", () => {
    const text = 'Here you go:\n```json\n{"answers": [{"sense": "hear", "accept": true}, {"sense": "see", "accept": false}, {"sense": "smell", "accept": true}]}\n```';
    expect([...(readVerdicts(text, ASKED) ?? [])]).toEqual([
      ["hear", true],
      ["see", false],
    ]);
  });

  it("is null for an answer it can't read", () => {
    expect(readVerdicts("I think hear, maybe.", ASKED)).toBeNull();
  });
});

describe("unanimous", () => {
  it("keeps only the senses every judge accepted; a judge's missing answer is a no", () => {
    const yesHear = new Map([["hear", true], ["see", true]] as const);
    const noSee = new Map([["hear", true], ["see", false]] as const);
    const silentOnSee = new Map([["hear", true]] as const);
    expect(unanimous(["hear", "see"], [yesHear, yesHear, noSee])).toEqual(["hear"]);
    expect(unanimous(["hear", "see"], [yesHear, yesHear, silentOnSee])).toEqual(["hear"]);
    expect(unanimous(["hear", "see"], [yesHear, yesHear, null])).toEqual([]);
  });
});

describe("mayFile", () => {
  it("writes the frozen may senses, with when and by whom, in the set's order", () => {
    const file = mayFile({ "The chips were salty and crunchy.": ["hear"], "Rain fell.": [] }, "2026-11-23");
    expect(file).toContain("Last judged 2026-11-23, by");
    expect(file).toContain('  "The chips were salty and crunchy.": ["hear"],');
    expect(file).not.toContain("Rain fell.");
    expect(file).toContain("export const SENSE_MAY");
  });
});

describe("mergeMay", () => {
  it("keeps the other set's frozen answers, takes this run's for its own sentences, in the sets' order", () => {
    const order = ["A first.", "B second.", "C third."];
    const before = { "A first.": ["hear"], "C third.": ["feel"] } as const;
    const judged = { "C third.": [], "B second.": ["smell"] } as const;
    expect(Object.entries(mergeMay(order, before, judged))).toEqual([
      ["A first.", ["hear"]],
      ["B second.", ["smell"]],
      ["C third.", []],
    ]);
  });
});
