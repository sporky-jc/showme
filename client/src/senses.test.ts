import { describe, expect, it } from "vitest";
import { repeatedTellWord, senseWords, wordsOf } from "./senses";

describe("senseWords", () => {
  it("finds the word that uses each sense", () => {
    expect(senseWords("His tail thumped the floor like a drum and he licked my salty cheek.")).toEqual({
      see: null,
      hear: "thumped",
      feel: "licked",
      smell: null,
      taste: "salty",
    });
  });

  it("matches whole words only, so telling words don't count as senses", () => {
    // "red" in tired and bored, "fur" in furious, "see" in seemed
    expect(senseWords("He was tired and bored and seemed furious today")).toEqual({
      see: null,
      hear: null,
      feel: null,
      smell: null,
      taste: null,
    });
  });

  it("counts every form of a word family", () => {
    const found = senseWords("Sparkly snow crackled while a puppy nuzzled my sniffly nose");
    expect(found.see).toBe("sparkly");
    expect(found.hear).toBe("crackled");
    expect(found.feel).toBe("nuzzled");
    expect(found.smell).toBe("sniffly");
  });

  it("ignores capitals and curly apostrophes", () => {
    expect(senseWords("BRIGHT lights! I couldn’t hear a thing").see).toBe("bright");
    expect(wordsOf("couldn’t")).toEqual(["couldn't"]);
  });

  it("finds nothing in an empty sentence", () => {
    expect(Object.values(senseWords("   "))).toEqual([null, null, null, null, null]);
  });
});

describe("repeatedTellWord", () => {
  it("finds the telling word copied from the Tell", () => {
    expect(repeatedTellWord("The dog was so happy", "The dog was happy.")).toBe("happy");
    expect(repeatedTellWord("My hands were COLD and red", "It is cold outside.")).toBe("cold");
  });

  it("is null when the Show sentence shows instead", () => {
    expect(repeatedTellWord("His tail thumped like a drum", "The dog was happy.")).toBeNull();
  });

  it("only counts telling words that are in this Tell", () => {
    // "happy" tells, but this Tell is about the cold
    expect(repeatedTellWord("I was happy to get inside", "It is cold outside.")).toBeNull();
  });

  it("ignores the Tell's ordinary words", () => {
    expect(repeatedTellWord("The dog ran", "The dog was happy.")).toBeNull();
  });
});
