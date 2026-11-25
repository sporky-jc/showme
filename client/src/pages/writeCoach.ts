import type { ScribblesMood, ScribblesProp } from "../components/Scribbles";

// A sentence this long has room for a detail
export const WORD_GOAL = 8;

// What Scribbles says on the Write page, and how he looks while he says it,
// worked out in one place so the two can't disagree. His words change when
// the sentence reaches a new stage, not with every letter, so a screen
// reader isn't talked over.
export function coachFor({
  tip,
  redoUntouched,
  tellWord,
  words,
  usedSenses,
  senseCoach,
}: {
  // The sense tip the student just asked for, if it is still showing
  tip: string | null;
  // A sentence sent back for another try, before any change
  redoUntouched: boolean;
  // The Tell's telling word, if the sentence repeats it
  tellWord: string | null;
  words: number;
  // How many senses the sentence uses (0 without the sense coach)
  usedSenses: number;
  // The senseCoach feature (see features.ts)
  senseCoach: boolean;
}): { text: string; mood: ScribblesMood; prop: ScribblesProp } {
  const clear = words >= WORD_GOAL && (!senseCoach || usedSenses >= 2) && !tellWord;
  const mood: ScribblesMood = tellWord ? "worried" : clear ? "happy" : tip !== null ? "thinking" : "idle";
  const prop: ScribblesProp = clear ? "none" : "note";
  return { text: textFor(), mood, prop };

  function textFor() {
    if (tip !== null) return tip;
    if (redoUntouched) {
      return senseCoach
        ? "Let's make it even better. Tap “Need an idea?” for a tip!"
        : "Let's make it even better!";
    }
    if (tellWord) return `“${tellWord}” is the Tell word. Can you show it instead?`;
    if (words === 0) {
      return senseCoach
        ? "Stuck? Tap “Need an idea?” and I'll help you think!"
        : "Write your sentence. I'll try to picture it!";
    }
    if (words < WORD_GOAL) return "It's getting clearer! Add a detail.";
    if (!senseCoach) return "I can picture it!";
    if (usedSenses === 0) return "I see shapes, but no details yet. What would you see or hear?";
    if (usedSenses === 1) return "Ooh, getting there! Can you add a second sense?";
    return `I can picture it! You used ${usedSenses} senses.`;
  }
}
