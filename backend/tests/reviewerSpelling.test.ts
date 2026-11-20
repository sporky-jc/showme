import { describe, expect, it } from "vitest";
import { misspelledWords } from "../reviewer/spelling.js";
import { reviewSentence, type ReviewProvider, type SafetyCheck, type WelfareCheck } from "../reviewer/reviewer.js";
import { REVIEW_INSTRUCTIONS } from "../reviewer/prompt.js";
import { TIPS } from "../reviewer/tips.js";

// Spelling: a sentence with mistakes is never approved into the gallery

const COLD = "It is cold outside.";
const safety: SafetyCheck = { name: "guard", check: async () => "safe" };
// The welfare check, seeing nothing worrying
const welfare: WelfareCheck = { name: "welfare", check: async () => ({ concern: "no" }) };
const answering = (answer: unknown): ReviewProvider => ({ name: "ai", review: async () => answer });

describe("the spelling check", () => {
  it.each([
    ["She jumpd up and down.", ["jumpd"]],
    ["The cafateria was lound.", ["cafateria", "lound"]],
    ["The sun was brite, brite and hot.", ["brite"]],
    ["teh snow fell", ["teh"]],
  ])("finds the misspelled words: %s", (show, words) => {
    expect(misspelledWords(show)).toEqual(words);
  });

  it.each([
    "My breath puffed out like a little cloud, and the frozen grass crunched under my boots.",
    "I couldn't feel my toes; they're icicles.",
    "Lily and Grandpa Joe played Minecraft by the fire.",
    "Brrrr, my teeth chattered. Wheee, down the hill!",
    "Ok, the snow went crunch, crunch, crunch.",
    "The Show sentence’s apostrophe isn’t a mistake.",
  ])("finds nothing in: %s", (show) => {
    expect(misspelledWords(show)).toEqual([]);
  });

  it("has a tip, and the AI is told about spelling", () => {
    expect(TIPS.spelling).toMatch(/spelling/i);
    expect(REVIEW_INSTRUCTIONS).toContain("Every word is spelled correctly");
  });
});

describe("the reviewer and spelling", () => {
  it("never approves a sentence with a misspelled word: it's sent back with the spelling tip", async () => {
    const { suggestion } = await reviewSentence(
      { tell: COLD, show: "My breth puffed out like a little cloud." },
      [answering({ verdict: "approve", tip: "great" })],
      { safety, welfare }
    );
    expect(suggestion).toEqual({
      verdict: "redo",
      tip: "spelling",
      reasons: ["ai", "spelling"],
      decidedBy: "ai",
      misspelled: ["breth"],
    });
  });

  it("keeps the AI's own tip for a redo, and lists the words for the teacher", async () => {
    const { suggestion } = await reviewSentence(
      { tell: COLD, show: "The wind felt realy sharp on my face." },
      [answering({ verdict: "redo", tip: "senses" })],
      { safety, welfare }
    );
    expect(suggestion).toMatchObject({ verdict: "redo", tip: "senses", misspelled: ["realy"] });
  });

  it("lists the words when nobody could decide, and never sends it back", async () => {
    const { suggestion } = await reviewSentence({ tell: COLD, show: "My breth puffed out like a cloud." }, [], {});
    expect(suggestion).toMatchObject({ verdict: "unsure", misspelled: ["breth"] });
  });

  it("never turns a hold into a send-back: a misspelled worrying sentence still goes to a person", async () => {
    const { suggestion } = await reviewSentence(
      { tell: COLD, show: "Nobody loves me and I am so lonley in the cold." },
      [answering({ verdict: "approve", tip: "great" })],
      { safety, welfare }
    );
    expect(suggestion).toMatchObject({ verdict: "unsure", decidedBy: "rules" });
  });

  it("leaves a correctly spelled approval alone", async () => {
    const { suggestion } = await reviewSentence(
      { tell: COLD, show: "My breath puffed out like a little cloud." },
      [answering({ verdict: "approve", tip: "great" })],
      { safety, welfare }
    );
    expect(suggestion).toEqual({ verdict: "approve", tip: "great", reasons: ["ai"], decidedBy: "ai" });
  });
});
