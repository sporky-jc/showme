import { describe, expect, it } from "vitest";
import { countWords, type ApprovedShow } from "../utils/senseWordCounts.js";

// The weekly sense word job's first step: which words from approved
// sentences it may ask the AI about (gate 1 in tasks/sense-words-plan.md)

// Each sentence by a different kid, answering Tells in turn
let next = 0;
const by = (...shows: string[]): ApprovedShow[] =>
  shows.map((show) => ({ show, author: `kid${(next += 1)}`, tell: `day${next % 2}` }));

const words = (approved: ApprovedShow[]) => countWords(approved).map((count) => count.word);

describe("countWords", () => {
  it("counts each word once per sentence, and keeps words in 3 or more", () => {
    const counts = countWords(
      by("The stench of the stench filled the hall.", "A stench came from the trash.", "What a stench!", "The dog wailed.", "The cat wailed.")
    );
    expect(counts).toContainEqual({ word: "stench", sentences: 3 });
    expect(counts.map((count) => count.word)).not.toContain("wailed");
  });

  it("sorts the most used words first", () => {
    const counts = countWords(by("Frigid air. Frigid wind.", "Frigid toes and cozy socks.", "Frigid! Cozy!", "Cozy bed, frigid room."));
    expect(counts.slice(0, 2)).toEqual([
      { word: "frigid", sentences: 4 },
      { word: "cozy", sentences: 3 },
    ]);
  });

  it("needs 3 different kids, so it's never one kid's word", () => {
    const oneKid = ["Stench!", "A stench.", "The stench."].map((show) => ({ show, author: "kid", tell: `t${show.length}` }));
    expect(words(oneKid)).not.toContain("stench");
    const twoKids = oneKid.map((sentence, i) => ({ ...sentence, author: `kid${i % 2}` }));
    expect(words(twoKids)).not.toContain("stench");
  });

  it("needs 2 different Tells, so it's never one prompt's word", () => {
    const oneTell = by("Stench!", "A stench.", "The stench.").map((sentence) => ({ ...sentence, tell: "day1" }));
    expect(words(oneTell)).not.toContain("stench");
  });

  it("leaves out names: a capital in the middle of a sentence, or a common first name", () => {
    expect(words(by("I gave Rose a rose.", "The rose was red.", "A rose grew.", "Rose smiled."))).not.toContain("rose");
    // Written in lower case, but a first name
    expect(words(by("my friend grace sang.", "grace hummed.", "Then grace laughed."))).not.toContain("grace");
  });

  it("keeps a word that only has a capital at the start of a sentence", () => {
    expect(words(by("Thunder rumbled.", "The thunder rumbled. Thunder again.", "Loud thunder."))).toContain("thunder");
  });

  it("leaves out words that aren't English, short words and words with apostrophes", () => {
    const found = words(by(...Array(3).fill("Zzblorp went the ox, and I can't stop.")));
    expect(found).not.toContain("zzblorp");
    expect(found).not.toContain("ox");
    expect(found).not.toContain("can't");
    expect(found).toContain("went");
  });

  it("leaves out words Scribbles' safety checks hold", () => {
    const found = words(by(...Array(3).fill("The crap smelled.")));
    expect(found).not.toContain("crap");
    expect(found).toContain("smelled");
  });

  it("passes on single words and counts only, never a sentence, a kid or a Tell", () => {
    const approved = by("Rain drummed on the roof.", "Rain drummed again.", "The rain drummed.");
    const counts = countWords(approved);
    for (const count of counts) {
      expect(Object.keys(count)).toEqual(["word", "sentences"]);
      expect(count.word).toMatch(/^[a-z]+$/);
    }
    const text = JSON.stringify(counts);
    for (const { show, author, tell } of approved) {
      expect(text).not.toContain(show);
      expect(text).not.toContain(author);
      expect(text).not.toContain(tell);
    }
  });
});
