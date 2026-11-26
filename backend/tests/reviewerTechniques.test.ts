import { describe, expect, it } from "vitest";
import { hasAlliteration, hasSimile, hasSoundWord, techniqueFound } from "../reviewer/techniques.js";
import { misspelledWords } from "../reviewer/spelling.js";

// What the code alone finds of what a Tell asks for (reviewer/techniques.ts).
// It only ever confirms: "not found" means a model judges.

describe("a simile", () => {
  it.each([
    "He zipped past every trap like a ninja and grabbed the cheese.",
    "My breath puffed out like a little cloud.",
    "The mouse was as quick as lightning.",
    "The wind sounded like a whistle.",
    "She ran like the wind past the traps.",
  ])("is found in %s", (show) => {
    expect(hasSimile(show)).toBe(true);
  });

  it.each([
    "I like cheese.",
    "He moved quickly past all of the traps.",
    "The soup was lava that turned my tongue into a burning desert.",
    "We like it when it snows.",
  ])("isn't found in %s", (show) => {
    expect(hasSimile(show)).toBe(false);
  });
});

describe("a sound word", () => {
  it.each(["Crunch went the snow under my boots.", "Brrrrr, my nose froze!", "The bacon went sizzle in the pan."])(
    "is found in %s",
    (show) => {
      expect(hasSoundWord(show)).toBe(true);
    }
  );

  it("isn't found in a quiet sentence", () => {
    expect(hasSoundWord("The house was big and white.")).toBe(false);
  });
});

describe("alliteration", () => {
  it.each(["Silly snakes slither slowly.", "Big brown bears bounce on the bed.", "Five fat frogs in the fog."])(
    "is found in %s",
    (show) => {
      expect(hasAlliteration(show)).toBe(true);
    }
  );

  it.each(["The cat sat on the mat.", "Snow fell softly on the roof."])("isn't found in %s", (show) => {
    expect(hasAlliteration(show)).toBe(false);
  });
});

describe("techniqueFound", () => {
  it("confirms what the code can see, and leaves the rest to a model", () => {
    expect(techniqueFound("simile", "It hopped like a frog.")).toBe(true);
    expect(techniqueFound("simile", "It hopped over the trap.")).toBeUndefined();
    expect(techniqueFound("onomatopoeia", "Splash! went the puddle.")).toBe(true);
    expect(techniqueFound("alliteration", "Silly snakes slither slowly.")).toBe(true);
    // Never for what only a reader can judge
    expect(techniqueFound("metaphor", "The soup was lava.")).toBeUndefined();
    expect(techniqueFound("personification", "The sun smiled.")).toBeUndefined();
    expect(techniqueFound("senses", "My breath puffed out like a little cloud.")).toBeUndefined();
  });
});

describe("words an allusion names", () => {
  it("aren't spelling mistakes, with or without a capital", () => {
    expect(misspelledWords("When Mom sees a mouse, her knees turn to jelly like she just met her kryptonite.")).toEqual([]);
    expect(misspelledWords("Hogwarts was bigger than our whole house.")).toEqual([]);
    expect(misspelledWords("My dad is my Superman.")).toEqual([]);
    // ... and a real mistake next to one still is
    expect(misspelledWords("Her kryptonite is a tiny mowse.")).toEqual(["mowse"]);
  });
});
