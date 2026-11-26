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
//   2. Is the child OK? Three local readers (the safety model, and both
//      local models' welfare answers). None worried: go on. Both local
//      models: a teacher (the safety model looks for harmful words, not for
//      a child who isn't OK, so it isn't waited for). Any other split: the
//      hosted model is asked only this. A sentence with personal details
//      never goes to it: it's sent back to take them out, and the version
//      without them is read afresh (the safety model's worry about such a
//      sentence is the details themselves, so it isn't counted). It's the
//      only time the hosted model is
//      asked, so only a small share of sentences go to it.
//   3. Certain reasons to send it back: personal details, rude or unkind
//      words, not in English, copying the Tell.
//   4. Is it fine for other children to read? Both local models are asked;
//      either one unsure sends it back with the kind-words tip.
//   5. Revise, as a teacher does, first problem first: on topic, then what
//      the Tell asks for (a simile, a metaphor...), then showing with a
//      detail. These are the first model's (Gemma 4 E4B when this was
//      written), the more accurate one: the second only checks it after a
//      child has been sent back three times for the same thing.
//   6. Clean up: spelling, capitals and punctuation (the code's) and
//      grammar (the first model's), as one tip when both are wrong.
//   7. Approve.
import type { Technique } from "../contract/api.js";
import type { ChecklistAnswer } from "./contract.js";
import type { RuleOutcome } from "./rules.js";
import { firstTip, PRAISE, TECHNIQUE_TIP, type TipId } from "./tips.js";
import type { WelfareQuestion } from "./reviewer.js";

// The two local models. "first" is the more accurate one (Gemma 4 E4B when
// this was written): it answers the writing checklist. Both answer the
// welfare and gallery questions.
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

// After this many send-backs for the same revise check, the second model
// checks the first one's "no" before the child is sent back for it again
export const RECHECK_AFTER = 3;

// The revise checks, in a teacher's order
export const REVISE_CHECKS = ["onTopic", "technique", "shows"] as const;
export type ReviseCheck = (typeof REVISE_CHECKS)[number];

// The hosted model's answer: only whether the child is OK
export interface HostedAnswer {
  concern: "yes" | "no";
}

// Everything known about one version of a sentence
export interface Facts {
  rules: RuleOutcome;
  // The writing checks' tip (spelling, capitals, end marks, punctuation),
  // or null when they found nothing
  writingTip: TipId | null;
  // What the Tell asks for, and whether the code already found it
  // (techniques.ts): then no model's "no" counts
  technique?: Technique;
  techniqueFound?: boolean;
  // A teacher took Scribbles' decision on these words back: they're the
  // teacher's now
  undone?: boolean;
  // The local readers' answers so far; a missing one hasn't come in yet
  safety?: "safe" | "unsafe";
  welfare?: Partial<Record<Voter, "yes" | "no">>;
  suitable?: Partial<Record<Voter, "yes" | "unsure">>;
  // The first model's writing checklist
  checklist?: ChecklistAnswer;
  // The second model's, asked only to check a "no" after RECHECK_AFTER
  // send-backs for it (step 5)
  recheck?: ChecklistAnswer;
  // How many times this child has been sent back for each revise check on
  // this Tell (the send-back step names its check: the caller counts them)
  sentBackFor?: Partial<Record<ReviseCheck, number>>;
  hosted?: HostedAnswer;
  // Failed tries per local reader on these words
  failedTries?: Partial<Record<Reader, number>>;
  // How long ago the local readers were found to disagree about a worry
  worryWaitedMs?: number;
}

export type TeacherBecause =
  | "worrying-words" // an explicit worrying phrase (step 1): no AI read it
  | "too-long" // the rules couldn't read it at all
  | "worry" // both local models, or the hosted model, saw a worry
  | "worry-not-checked" // a split worry the hosted model couldn't be asked about
  | "model-failed" // a local model failed on these words again and again
  | "undone"; // a teacher took Scribbles' decision back

export type Step =
  | { step: "approve"; tip: TipId }
  // check: the revise check it was sent back for, for the caller to count
  | { step: "send-back"; tip: TipId; check?: ReviseCheck }
  | { step: "teacher"; because: TeacherBecause }
  | { step: "ask-local"; question: WelfareQuestion }
  // The second model's checklist, to check the first one's "no"
  | { step: "ask-recheck" }
  | { step: "ask-hosted"; question: WelfareQuestion; about: "worry" };

// Rule holds that are only about the words used: asked the stricter welfare
// question (serious or immediate danger), as today (reviewer.ts, RUDE_ONLY)
const RUDE = new Set(["unsafe-words", "unkind", "names-someone"]);

const reasonsOf = (rules: RuleOutcome) => (rules.outcome === "pass" ? [] : rules.reasons);

export const welfareQuestion = (rules: RuleOutcome): WelfareQuestion => {
  const reasons = reasonsOf(rules);
  return reasons.length > 0 && reasons.every((reason) => RUDE.has(reason)) ? "danger" : "welfare";
};

// Step 3: the certain reasons, in order; null when there are none. The
// writing checks' tip isn't one of them: it waits for step 6.
const certainTip = ({ rules }: Facts): TipId | null => {
  const reasons: string[] = reasonsOf(rules);
  if (reasons.includes("personal-details")) return "privateDetails";
  if (reasons.some((reason) => RUDE.has(reason))) return "kindWords";
  if (reasons.includes("not-english")) return "inEnglish";
  if (rules.outcome === "redo") return rules.tip;
  return null;
};

// Step 5: does this checklist pass this revise check? A Tell that asks for
// the senses (or for nothing) has no technique of its own to check: showing
// with a detail is the same thing. One the code found passes.
const passes = (check: ReviseCheck, answer: ChecklistAnswer, facts: Facts) => {
  if (check === "technique") {
    if (!facts.technique || facts.technique === "senses" || facts.techniqueFound) return true;
  }
  return answer[check] === "yes";
};

const reviseTip = (check: ReviseCheck, checklist: ChecklistAnswer, technique?: Technique): TipId => {
  if (check === "onTopic") return "onTopic";
  if (check === "technique") return (technique && TECHNIQUE_TIP[technique]) || "compare";
  return checklist.detail;
};

export const decide = (facts: Facts): Step => {
  const { rules, undone, safety, welfare = {}, suitable = {}, checklist, hosted, failedTries = {} } = facts;
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
  if (
    worries.some((answer) => answer === undefined) ||
    VOTERS.some((voter) => !suitable[voter]) ||
    !checklist
  ) {
    return { step: "ask-local", question };
  }

  // The hosted model, when it has been asked: a worry is final
  if (hosted?.concern === "yes") return { step: "teacher", because: "worry" };

  // 2. Is the child OK?
  if (VOTERS.every((voter) => welfare[voter] === "yes")) return { step: "teacher", because: "worry" };
  // With personal details, the safety model flags the details themselves
  // (its privacy category): only the two local models count
  const personal = reasons.includes("personal-details");
  const counted = personal ? [welfare.first, welfare.second] : worries;
  const worrySplit = counted.some((answer) => answer === "unsafe" || answer === "yes");
  if (worrySplit && !hosted) {
    // Personal details never go to the hosted model: they're taken out
    // first, and the new version is read afresh, by the hosted model too
    // if the local models still disagree
    if (personal) return { step: "send-back", tip: "privateDetails" };
    if ((facts.worryWaitedMs ?? 0) >= WORRY_WAIT_MS) return { step: "teacher", because: "worry-not-checked" };
    return { step: "ask-hosted", question, about: "worry" };
  }

  // 3. Certain reasons to send it back
  const tip = certainTip(facts);
  if (tip) return { step: "send-back", tip };

  // 4. Fine for other children to read?
  if (VOTERS.some((voter) => suitable[voter] === "unsure")) return { step: "send-back", tip: "kindWords" };

  // 5. Revise, first problem first
  for (const check of REVISE_CHECKS) {
    if (passes(check, checklist, facts)) continue;
    // Sent back for this already and again: the second model checks first
    if ((facts.sentBackFor?.[check] ?? 0) >= RECHECK_AFTER) {
      if (!facts.recheck) return { step: "ask-recheck" };
      if (passes(check, facts.recheck, facts)) continue;
    }
    return { step: "send-back", tip: reviseTip(check, checklist, facts.technique), check };
  }

  // 6. Clean up: one tip for the writing checks' mistakes and a grammar one
  const cleanUp = firstTip(checklist.grammar === "no" ? "readAloud" : null, facts.writingTip);
  if (cleanUp) return { step: "send-back", tip: cleanUp };

  // 7. Ready for the gallery
  return { step: "approve", tip: PRAISE };
};
