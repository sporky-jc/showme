import { describe, expect, it } from "vitest";
import { countWords } from "../utils/senseWordCounts.js";

// The weekly sense word job's first step: which words from approved
// sentences it may ask the AI about

describe("countWords", () => {
  it("counts each word once per sentence, and keeps words in 3 or more", () => {
    const counts = countWords([
      "The stench of the stench filled the hall.",
      "A stench came from the trash.",
      "What a stench!",
      "The dog wailed.",
      "The cat wailed.",
    ]);
    expect(counts).toContainEqual({ word: "stench", sentences: 3 });
    expect(counts.map((count) => count.word)).not.toContain("wailed");
  });

  it("sorts the most used words first", () => {
    const counts = countWords(["Frigid air. Frigid wind.", "Frigid toes and cozy socks.", "Frigid! Cozy!", "Cozy bed, frigid room."]);
    expect(counts.slice(0, 2)).toEqual([
      { word: "frigid", sentences: 4 },
      { word: "cozy", sentences: 3 },
    ]);
  });

  it("leaves out names: a word with a capital in the middle of a sentence", () => {
    const counts = countWords(["I gave Rose a rose.", "The rose was red.", "A rose grew.", "Rose smiled."]);
    expect(counts.map((count) => count.word)).not.toContain("rose");
  });

  it("keeps a word that only has a capital at the start of a sentence", () => {
    const counts = countWords(["Thunder rumbled.", "The thunder rumbled. Thunder again.", "Loud thunder."]);
    expect(counts.map((count) => count.word)).toContain("thunder");
  });

  it("leaves out words that aren't English, short words and words with apostrophes", () => {
    const shows = ["Zzblorp went the ox, and I can't stop.", "Zzblorp went the ox, and I can't stop.", "Zzblorp went the ox, and I can't stop."];
    const words = countWords(shows).map((count) => count.word);
    expect(words).not.toContain("zzblorp");
    expect(words).not.toContain("ox");
    expect(words).not.toContain("can't");
    expect(words).toContain("went");
  });

  it("leaves out words Scribbles' safety checks hold", () => {
    const shows = ["The crap smelled.", "The crap smelled.", "The crap smelled."];
    const words = countWords(shows).map((count) => count.word);
    expect(words).not.toContain("crap");
    expect(words).toContain("smelled");
  });
});
