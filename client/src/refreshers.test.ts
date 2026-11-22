import { describe, expect, it } from "vitest";
import { REFRESHERS } from "./refreshers";

// Every refresher is only words (see refreshers.ts), so these check the words
// make a refresher that works: every step has a right answer that exists.

describe("REFRESHERS", () => {
  it.each(Object.entries(REFRESHERS))("%s has every step, each with a real right answer", (_, words) => {
    for (const text of [words.name, words.ask, words.meaning, words.clue, words.tell, words.phrase]) {
      expect(text.trim()).not.toBe("");
    }
    for (const step of [words.spot, words.finish, words.check]) {
      expect(step.choices.length).toBeGreaterThanOrEqual(2);
      expect(step.choices[step.answer]).toBeDefined();
      expect(new Set(step.choices).size).toBe(step.choices.length);
      expect(step.yes.startsWith("Yes!")).toBe(true);
      expect(step.hint.trim()).not.toBe("");
    }
    expect(words.finish.start.trim()).not.toBe("");
    // "Spot it" is the example sentence in pieces: the right piece is part of it
    expect(words.spot.choices.join(" ")).toContain(words.spot.choices[words.spot.answer]);
  });

  it("asks in the button's words, a question", () => {
    for (const words of Object.values(REFRESHERS)) {
      expect(words.ask).toMatch(/^What’s .+\?$/);
    }
  });
});
