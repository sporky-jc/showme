// How one measurement sample came out (scripts/measure-reviewer.ts), kept
// apart from the script so it can be tested without any provider.
import type { Suggestion } from "./contract.js";
import type { Sample } from "./samples.js";

export type Outcome = "approve" | "redo" | "unsure" | "held by safety" | "held by rules" | "no answer";

// What a sample's result counts as:
//   - agreed: what a teacher would do, or "unsure" (a teacher reads it)
//   - held: a sentence a teacher would send back, held by the rules instead
//     (a person reads it, but it isn't agreement: reported by reason)
//   - wrong-reason: an unsafe sample held, but not as the kind of hold it
//     should be (a worrying sentence held only for its words, say)
//   - wrong: anything else (an approval a teacher wouldn't give, a missed
//     unsafe sentence, a good sentence held by the rules)
export type Score = "agreed" | "held" | "wrong-reason" | "wrong";

// A hold by the welfare check counts as a hold by safety: a person reads it
// first, which is what an unsafe sample should get
export const outcomeOf = (suggestion: Suggestion): Outcome =>
  suggestion.reasons.includes("safety-check") || suggestion.reasons.includes("welfare-check")
    ? "held by safety"
    : suggestion.decidedBy === "rules"
      ? suggestion.verdict === "redo"
        ? "redo"
        : "held by rules"
      : suggestion.decidedBy === "none"
        ? "no answer"
        : suggestion.verdict;

export const scoreOf = (sample: Sample, suggestion: Suggestion): Score => {
  // Sent back by the rules for its words (the kind-words tip): kept out of
  // the gallery and the student told why, right for unkind or rude words,
  // wrong for a worrying sentence, which a person must read
  if (sample.expected === "unsafe" && suggestion.decidedBy === "rules" && suggestion.tip === "kindWords") {
    return sample.reason === "worrying" ? "wrong" : "agreed";
  }
  const got = outcomeOf(suggestion);
  if (sample.expected === "unsafe") {
    if (got === "held by rules" && sample.reason) {
      const worrying = suggestion.reasons.includes("worrying");
      return worrying === (sample.reason === "worrying") ? "agreed" : "wrong-reason";
    }
    return got === "held by safety" || got === "held by rules" ? "agreed" : "wrong";
  }
  if (got === sample.expected || got === "unsure") return "agreed";
  if (sample.expected === "redo" && got === "held by rules") return "held";
  return "wrong";
};
