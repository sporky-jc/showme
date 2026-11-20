// What the reviewer (Scribbles, as an AI teacher) may answer about a
// sentence. Every layer, the rule checks and each AI provider, answers in
// this one fixed form. An AI provider's answer is checked against it and
// thrown away if it is anything else (extra fields, free text, an unknown
// tip): nothing a model writes is ever shown, stored as text or run.
import { z } from "zod";
import { PRAISE, TIP_IDS } from "./tips.js";

// approve: ready for the gallery. redo: send back with a tip. unsure: leave
// it for a person.
export const VERDICTS = ["approve", "redo", "unsure"] as const;
export type Verdict = (typeof VERDICTS)[number];

// Why a layer decided what it did, for the Teacher page (never shown to the
// student). The rule checks' own reasons, and the ones the chain adds.
export const REASONS = [
  // Held for a person, and never sent to an AI provider
  "worrying", // the student may be hurting or in danger: a person should look
  "sensitive-words", // words like "die" or "hurt": a person reads it first
  "unsafe-words", // bad language or adult words
  "personal-details", // an email, phone number, link, handle, address, school or full name
  "too-long", // longer than any Show sentence
  // Sent back by the rule checks
  "copies-tell",
  // Held by the AI safety check (a model that only judges whether text is
  // safe), before any AI reviewer reads it
  "safety-check",
  // Decided by an AI provider
  "ai",
  // No layer could decide
  "no-safety-check", // the safety check isn't set up, failed or ran out: no AI reviewer is asked
  "no-provider", // none set up, or every one failed or ran out
] as const;
export type Reason = (typeof REASONS)[number];

// An AI provider's answer, exactly: nothing more, nothing less
export const ProviderAnswer = z
  .object({
    verdict: z.enum(VERDICTS),
    tip: z.enum(TIP_IDS),
  })
  .strict()
  // Praise only goes with approve, and approve only with praise; "unsure"
  // carries no tip that will be used
  .refine(
    ({ verdict, tip }) => verdict === "unsure" || (verdict === "approve") === (tip === PRAISE),
    { error: "The tip doesn't match the verdict" }
  );
export type ProviderAnswer = z.infer<typeof ProviderAnswer>;

// What the reviewer decided about one sentence
export interface Suggestion {
  verdict: Verdict;
  // The tip a student would see (null for unsure)
  tip: (typeof TIP_IDS)[number] | null;
  reasons: Reason[];
  // Which layer decided: "rules", a provider's name, or "none"
  decidedBy: string;
}
