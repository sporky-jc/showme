// The limit on "Try again"s for one sentence. Kept apart from reviewer.ts,
// with nothing but types imported, so the Teacher page's route can apply it
// too without loading the reviewer (its dictionary and providers).
import type { Suggestion } from "./contract.js";

// How many times one sentence may be sent back with "Try again". A child
// fixes one thing per try; after two, another "Try again" is more likely to
// make them give up than to help, so Scribbles leaves the sentence to a
// person. Applied where the suggestion is made (reviewer.ts), so it holds the
// same once Scribbles sends sentences back on its own, and again where the
// Teacher page shows it (controllers/routes.ts), for a suggestion saved
// before the latest send-back.
export const MAX_SEND_BACKS = 2;

// A "redo" for a sentence already sent back MAX_SEND_BACKS times becomes
// "unsure", for a person, whoever suggested it (the rules, the AI or the
// writing checks). Its tip goes (a person picks one, if any), and the
// mistakes found stay as evidence for the teacher. An approval is still an
// approval, and a hold is already "unsure", with its own reasons. Applying
// it twice changes nothing more.
export const withinSendBacks = <S extends Pick<Suggestion, "verdict" | "tip" | "reasons">>(
  suggestion: S,
  sentBack: number
): S =>
  suggestion.verdict === "redo" && sentBack >= MAX_SEND_BACKS
    ? { ...suggestion, verdict: "unsure", tip: null, reasons: [...suggestion.reasons, "redo-limit"] }
    : suggestion;
