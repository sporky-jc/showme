// The decider: what Scribbles does next with one version of a sentence,
// from what is known about it so far (tasks/scribbles-worker-spec.md, "How
// one sentence is decided"). One function, no database, no AI, no clock: it
// is asked again each time a new answer comes in, and the same facts always
// give the same step.
//
// It only ever says one of: approve, send back (with one of our fixed
// tips), ask the local models, ask the hosted model, or hand it to a
// teacher. A missing answer is never read as "fine" or as "worrying": the
// step is to ask for it again, so an outage only makes a sentence wait.
//
//   1. The rule checks. An explicit worrying phrase goes to a teacher, and
//      to no AI.
//   2. Is the child OK? Three local readers (the safety model, and the two
//      local models' welfare answers). None worried: go on. Both local
//      models: a teacher (the safety model looks for harmful words, not
//      for a child who isn't OK, so it isn't waited for). Any other split:
//      the hosted model has the last word (never for a sentence with
//      personal details: then a teacher). This is the only time the
//      hosted model is asked, so only a small share of sentences go to it.
//   3. Certain reasons to send it back, no model's opinion needed.
//   4. The verdict from the two local models. Agree: done. Split: sent
//      back, with the tip of a model that didn't approve (the first's when
//      neither did). The worst this does is ask a child to look again at
//      a good sentence; it never puts one in the gallery that a model
//      doubted.
import type { ProviderAnswer } from "./contract.js";
import type { RuleOutcome } from "./rules.js";
import { PRAISE, type TipId } from "./tips.js";
import type { WelfareQuestion } from "./reviewer.js";

// The two local models that give verdicts. "first" is the more accurate one
// (Gemma 4 E4B when this was written): its tip is used when both say redo.
export const VOTERS = ["first", "second"] as const;
export type Voter = (typeof VOTERS)[number];

// The three local readers asked whether the child is OK
export const READERS = ["safety", ...VOTERS] as const;
export type Reader = (typeof READERS)[number];

// A model that fails on the same words this many times (counted only when
// it answered other sentences meanwhile: the caller's job) hands the
// sentence to a teacher
export const MAX_FAILED_TRIES = 3;

// How long a worry the local readers disagreed about may wait for the hosted
// model before a teacher reads it instead
export const WORRY_WAIT_MS = 6 * 60 * 60 * 1000;

// The hosted model's answer: both questions, always asked together
export interface HostedAnswer {
  concern: "yes" | "no";
  verdict: ProviderAnswer;
}

// Everything known about one version of a sentence
export interface Facts {
  rules: RuleOutcome;
  // The writing checks' tip (spelling, capitals, end marks, punctuation),
  // or null when they found nothing
  writingTip: TipId | null;
  // A teacher took Scribbles' decision on these words back: they're the
  // teacher's now
  undone?: boolean;
  // The local readers' answers so far; a missing one hasn't come in yet
  safety?: "safe" | "unsafe";
  welfare?: Partial<Record<Voter, "yes" | "no">>;
  verdicts?: Partial<Record<Voter, ProviderAnswer>>;
  hosted?: HostedAnswer;
  // Failed tries per local reader on these words
  failedTries?: Partial<Record<Reader, number>>;
  // How long ago the local readers were found to disagree about a worry
  worryWaitedMs?: number;
}

export type TeacherBecause =
  | "worrying-words" // an explicit worrying phrase (step 1): no AI read it
  | "too-long" // the rules couldn't read it at all
  | "worry" // all three local readers, or the hosted model, saw a worry
  | "worry-not-checked" // a split worry the hosted model couldn't be asked about
  | "model-failed" // a local model failed on these words again and again
  | "undone"; // a teacher took Scribbles' decision back

export type Step =
  | { step: "approve"; tip: TipId }
  | { step: "send-back"; tip: TipId }
  | { step: "teacher"; because: TeacherBecause }
  | { step: "ask-local"; question: WelfareQuestion }
  | { step: "ask-hosted"; question: WelfareQuestion; about: "worry" };

// Rule holds that are only about the words used: asked the stricter welfare
// question (serious or immediate danger), as today (reviewer.ts, RUDE_ONLY)
const RUDE = new Set(["unsafe-words", "unkind", "names-someone"]);

const reasonsOf = (rules: RuleOutcome) => (rules.outcome === "pass" ? [] : rules.reasons);

export const welfareQuestion = (rules: RuleOutcome): WelfareQuestion => {
  const reasons = reasonsOf(rules);
  return reasons.length > 0 && reasons.every((reason) => RUDE.has(reason)) ? "danger" : "welfare";
};

// Step 3: the certain reasons, in order; null when there are none
const certainTip = ({ rules, writingTip }: Facts): TipId | null => {
  const reasons: string[] = reasonsOf(rules);
  if (reasons.includes("personal-details")) return "privateDetails";
  if (reasons.some((reason) => RUDE.has(reason))) return "kindWords";
  if (reasons.includes("not-english")) return "inEnglish";
  if (rules.outcome === "redo") return rules.tip;
  return writingTip;
};

// One model's verdict turned into a step. "Unsure" means "not for the
// gallery" (unkind, scary, romance...): sent back with the kind-words tip.
// (An answer here has already been checked against the fixed form, which
// only allows the praise tip with "approve": contract.ts.)
const fromVerdict = ({ verdict, tip }: ProviderAnswer): Step => {
  if (verdict === "approve") return { step: "approve", tip: PRAISE };
  if (verdict === "redo") return { step: "send-back", tip };
  return { step: "send-back", tip: "kindWords" };
};

export const decide = (facts: Facts): Step => {
  const { rules, undone, safety, welfare = {}, verdicts = {}, hosted, failedTries = {} } = facts;
  const reasons: string[] = reasonsOf(rules);
  const question = welfareQuestion(rules);

  if (undone) return { step: "teacher", because: "undone" };

  // 1. The rule checks. An explicit worrying phrase ("worrying" without
  // "sensitive-words") goes to a teacher and to no AI. Far too long: the
  // rules didn't read it at all (the API refuses to save one anyway).
  if (reasons.includes("worrying") && !reasons.includes("sensitive-words")) {
    return { step: "teacher", because: "worrying-words" };
  }
  if (reasons.includes("too-long")) return { step: "teacher", because: "too-long" };

  // A local model that keeps failing on these words
  if (READERS.some((reader) => (failedTries[reader] ?? 0) >= MAX_FAILED_TRIES)) {
    return { step: "teacher", because: "model-failed" };
  }

  // Every local answer first: none is ever guessed
  const worries = [safety, welfare.first, welfare.second];
  if (worries.some((answer) => answer === undefined) || VOTERS.some((voter) => !verdicts[voter])) {
    return { step: "ask-local", question };
  }

  // The hosted model, when it has been asked: a worry is final
  if (hosted?.concern === "yes") return { step: "teacher", because: "worry" };

  // 2. Is the child OK?
  const worried = worries.filter((answer) => answer === "unsafe" || answer === "yes").length;
  if (VOTERS.every((voter) => welfare[voter] === "yes")) return { step: "teacher", because: "worry" };
  const worrySplit = worried > 0;
  if (worrySplit && !hosted) {
    // Personal details never go to the hosted model
    if (reasons.includes("personal-details")) return { step: "teacher", because: "worry" };
    if ((facts.worryWaitedMs ?? 0) >= WORRY_WAIT_MS) return { step: "teacher", because: "worry-not-checked" };
    return { step: "ask-hosted", question, about: "worry" };
  }

  // 3. Certain reasons to send it back
  const tip = certainTip(facts);
  if (tip) return { step: "send-back", tip };

  // 4. The verdict. The hosted model's, when it was asked about a worry
  // (it gives both answers together), is final.
  if (hosted) return fromVerdict(hosted.verdict);
  const first = verdicts.first!;
  const second = verdicts.second!;
  if (first.verdict === second.verdict) return fromVerdict(first);
  // Split: never approved. The tip of a model that didn't approve.
  return fromVerdict(first.verdict === "approve" ? second : first);
};
