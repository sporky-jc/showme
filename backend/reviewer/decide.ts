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
//      hosted model is asked only this. When both worry and there is
//      something for the child to fix (personal details, or a model says
//      it's unkind about someone), it's sent back to fix AND a teacher is
//      told; a worry with nothing to fix goes to a teacher only. A
//      sentence with personal details
//      never goes to it: it's sent back to take them out, and the version
//      without them is read afresh (the safety model's worry about such a
//      sentence is the details themselves, so it isn't counted). It's the
//      only time the hosted model is
//      asked, so only a small share of sentences go to it.
//   3. Certain reasons to send it back: personal details, rude or unkind
//      words, not in English, copying the Tell.
//   4-6. The first model's checklist (Gemma 4 E4B when this was written,
//      the more accurate one), first problem first, as a teacher reviews:
//      4. fine for other children to read? If not, the kind-words tip.
//      5. Revise: on topic, then what the Tell asks for (a simile, a
//         metaphor...), then showing with a detail.
//      6. Clean up: spelling, capitals and punctuation (the code's) and
//         grammar, as one tip when both are wrong.
//   7. Before approving, the second model answers the same checklist. Its
//      "unkind" or "unsure" about the gallery, or a grammar mistake it finds, sends the
//      sentence back: an approval needs both models to say it's fine for
//      other children. Topic, technique and detail stay the first model's
//      to judge (letting the second veto those too sent 4 good sentences
//      back in the scores, and stopped no wrong approval).
//   8. Approve.
//   When the two models keep disagreeing on one check (the child has been
//   sent back RECHECK_AFTER times for it), the check passes, so one model
//   can't keep a child in a loop; when both say no, it goes back as usual.
import type { Technique } from "../contract/api.js";
import type { ChecklistAnswer } from "./contract.js";
import type { RuleOutcome } from "./rules.js";
import { firstTip, PRAISE, TECHNIQUE_TIP, type TipId } from "./tips.js";
import type { WelfareQuestion } from "./reviewer.js";

// The two local models. "first" is the more accurate one (Gemma 4 E4B when
// this was written): its checklist decides what's wrong first. Both answer
// the welfare question, and the second the checklist before an approval.
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

// After this many send-backs for the same check, the two models must agree
// that it fails before the child is sent back for it again
export const RECHECK_AFTER = 3;

// The revise checks, in a teacher's order, and the checks that count
// send-backs (grammar too)
export const REVISE_CHECKS = ["onTopic", "technique", "shows"] as const;
export type ReviseCheck = (typeof REVISE_CHECKS)[number];
export const CHECKS = [...REVISE_CHECKS, "grammar"] as const;
export type Check = (typeof CHECKS)[number];

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
  // The first model's checklist
  checklist?: ChecklistAnswer;
  // The second model's, asked only when it's needed: before an approval,
  // or to check the first's "no" after RECHECK_AFTER send-backs for it
  second?: ChecklistAnswer;
  // How many times this child has been sent back for each check on this
  // Tell (the send-back step names its check: the caller counts them)
  sentBackFor?: Partial<Record<Check, number>>;
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
  // teacher: also told to a teacher (both local models worried, and the
  // child has something to fix: personal details, or unkind words)
  | { step: "send-back"; tip: TipId; check?: Check; teacher?: "worry" }
  | { step: "teacher"; because: TeacherBecause }
  | { step: "ask-local"; question: WelfareQuestion }
  // The second model's checklist, before an approval or to check a "no"
  | { step: "ask-second" }
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

// Does this checklist pass this check? A Tell that asks for the senses (or
// for nothing) has no technique of its own to check: showing with a detail
// is the same thing. One the code found passes.
const passes = (check: Check, answer: ChecklistAnswer, facts: Facts) => {
  if (check === "technique") {
    if (!facts.technique || facts.technique === "senses" || facts.techniqueFound) return true;
  }
  return answer[check] === "yes";
};

const tipFor = (check: Check, checklist: ChecklistAnswer, facts: Facts): TipId => {
  if (check === "onTopic") return "onTopic";
  if (check === "technique") return (facts.technique && TECHNIQUE_TIP[facts.technique]) || "compare";
  if (check === "shows") return checklist.detail;
  return firstTip("readAloud", facts.writingTip)!;
};

const sentBackOften = (check: Check, facts: Facts) => (facts.sentBackFor?.[check] ?? 0) >= RECHECK_AFTER;

export const decide = (facts: Facts): Step => {
  const { rules, undone, safety, welfare = {}, checklist, second, hosted, failedTries = {} } = facts;
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
  if (worries.some((answer) => answer === undefined) || !checklist) return { step: "ask-local", question };

  // The hosted model, when it has been asked: a worry is final
  if (hosted?.concern === "yes") return { step: "teacher", because: "worry" };

  // 2. Is the child OK? Both local models worried: a teacher. With
  // something to fix, the child is sent back to fix it too: personal
  // details, or unkind words about someone (either model's "unkind",
  // the second asked only then). Not when the rules found a worrying
  // phrase, so a child who wrote about being hurt isn't told to be kind.
  if (VOTERS.every((voter) => welfare[voter] === "yes")) {
    if (reasons.includes("personal-details")) return { step: "send-back", tip: "privateDetails", teacher: "worry" };
    if (!reasons.includes("worrying")) {
      if (checklist.suitable === "unkind") return { step: "send-back", tip: "kindWords", teacher: "worry" };
      if (!second) return { step: "ask-second" };
      if (second.suitable === "unkind") return { step: "send-back", tip: "kindWords", teacher: "worry" };
    }
    return { step: "teacher", because: "worry" };
  }
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
  if (checklist.suitable !== "yes") return { step: "send-back", tip: "kindWords" };

  // 5-6. The first model's checklist, first problem first. A "no" the
  // child has been sent back for often must be the second model's too.
  for (const check of CHECKS) {
    if (passes(check, checklist, facts)) continue;
    if (sentBackOften(check, facts)) {
      if (!second) return { step: "ask-second" };
      if (passes(check, second, facts)) continue;
    }
    return { step: "send-back", tip: tipFor(check, checklist, facts), check };
  }
  if (facts.writingTip) return { step: "send-back", tip: facts.writingTip };

  // 7. Before approving: the second model's checklist too
  if (!second) return { step: "ask-second" };
  if (second.suitable !== "yes") return { step: "send-back", tip: "kindWords" };
  // (A check the models keep disagreeing on passes: see the top)
  if (!passes("grammar", second, facts) && !sentBackOften("grammar", facts)) {
    return { step: "send-back", tip: tipFor("grammar", second, facts), check: "grammar" };
  }

  // 8. Ready for the gallery
  return { step: "approve", tip: PRAISE };
};
