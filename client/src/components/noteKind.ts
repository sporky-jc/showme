import type { ScribblesSuggestion } from "../api/types";

// Which of Scribbles' notes a suggestion makes on the Teacher page
// (ScribblesNote.tsx), and so where its card goes: a worrying sentence first.
export type NoteKind = "check-in" | "held" | "ready" | "again" | "your-call";

// Why the rules held a sentence for a person, in Scribbles' words
export const HELD = {
  "personal-details": "It may share something personal, like a name or an address,",
  "unsafe-words": "It has words that don't belong in the gallery,",
  "sensitive-words": "It has words a grown-up should read first,",
  unkind: "It may be unkind about someone,",
  "names-someone": "It may name someone in an unkind or hurtful way,",
  "not-english": "It's mostly not in English,",
  "safety-check": "It may not be safe for the gallery,",
  "too-long": "It's much longer than a Show sentence,",
} as const;

// Which note a suggestion makes. A worrying sentence always comes first.
export const noteKind = (suggestion: ScribblesSuggestion): NoteKind => {
  if (suggestion.reasons.includes("worrying")) return "check-in";
  if (suggestion.reasons.some((reason) => reason in HELD)) return "held";
  if (suggestion.verdict === "approve") return "ready";
  if (suggestion.verdict === "redo") return "again";
  return "your-call";
};

