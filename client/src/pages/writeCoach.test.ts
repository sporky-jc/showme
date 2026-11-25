import { describe, expect, it } from "vitest";
import { WORD_GOAL, coachFor } from "./writeCoach";

// What Scribbles says on Write and how he looks, for each stage of a sentence
const at = (over: Partial<Parameters<typeof coachFor>[0]>) =>
  coachFor({ tip: null, redoUntouched: false, tellWord: null, words: 0, usedSenses: 0, senseCoach: true, ...over });

describe("coachFor", () => {
  it("shows the tip the student asked for, thinking, before anything else", () => {
    expect(at({ tip: "What sounds are there?", redoUntouched: true, words: WORD_GOAL, usedSenses: 1 })).toEqual({
      text: "What sounds are there?",
      mood: "thinking",
      prop: "note",
    });
  });

  it("looks worried about the Tell word, even while a tip is showing", () => {
    expect(at({ tip: "What sounds are there?", tellWord: "cold" }).mood).toBe("worried");
    expect(at({ tellWord: "cold", words: WORD_GOAL, usedSenses: 3 })).toEqual({
      text: "“cold” is the Tell word. Can you show it instead?",
      mood: "worried",
      prop: "note",
    });
  });

  it("walks a sentence from empty to clear, with the sense coach on", () => {
    expect(at({}).text).toBe("Stuck? Tap “Need an idea?” and I'll help you think!");
    expect(at({ words: WORD_GOAL - 1 }).text).toBe("It's getting clearer! Add a detail.");
    expect(at({ words: WORD_GOAL }).text).toBe("I see shapes, but no details yet. What would you see or hear?");
    expect(at({ words: WORD_GOAL, usedSenses: 1 })).toEqual({
      text: "Ooh, getting there! Can you add a second sense?",
      mood: "idle",
      prop: "note",
    });
    expect(at({ words: WORD_GOAL, usedSenses: 2 })).toEqual({
      text: "I can picture it! You used 2 senses.",
      mood: "happy",
      prop: "none",
    });
  });

  it("asks for no senses with the sense coach off", () => {
    expect(at({ senseCoach: false }).text).toBe("Write your sentence. I'll try to picture it!");
    expect(at({ senseCoach: false, words: WORD_GOAL })).toEqual({
      text: "I can picture it!",
      mood: "happy",
      prop: "none",
    });
  });

  it("greets a sentence sent back for another try, until it is changed", () => {
    expect(at({ redoUntouched: true, words: WORD_GOAL }).text).toBe(
      "Let's make it even better. Tap “Need an idea?” for a tip!"
    );
    expect(at({ redoUntouched: true, senseCoach: false }).text).toBe("Let's make it even better!");
  });
});
