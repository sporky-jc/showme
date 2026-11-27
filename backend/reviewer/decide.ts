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
//      hosted model is asked only this. When both worry and both say it's
//      unkind about someone (and the safety model and the rules see
//      nothing more), it's sent back to fix AND a teacher is told. A
//      sentence with personal details is sent back to take them out, and
//      the version without them is read afresh (the safety model's worry
//      about such a sentence is the details themselves, so it isn't
//      counted). Only when both local models worry about one is the
//      hosted model asked: a worry goes to a teacher, none and it's sent
//      back. Those are the only times the hosted model is asked, so only a
//      small share of sentences go to it.
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
//      "unkind" or "unsure" about the gallery sends the sentence back. When
//      it disagrees with the first on the writing (off topic, doesn't show,
//      a grammar mistake), the hosted model breaks the tie: its checklist
//      decides the writing (in a test of the ties it was right 9 times in
//      11, and both misses were the gallery question, which stays the local
//      models'). About 4 sentences in 100. Letting the second model veto
//      the writing by itself sent good sentences back in the scores; never
//      letting it let "The food was yummy." through.
//   8. Approve.
//   When the two models keep disagreeing on one check (the child has been
//   sent back RECHECK_AFTER times for it), the check passes, so one model
//   can't keep a child in a loop; when both say no, it goes back as usual.
import type { Technique } from "../contract/api.js";
import { ChecklistAnswer, REASONS, YES_NO } from "./contract.js";
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
// model (down, or out of its free daily allowance) before a teacher reads
// it instead: an hour, so a worry written in the morning is seen the same
// school day (the owner's choice)
export const WORRY_WAIT_MS = 60 * 60 * 1000;
// How long a writing tie may wait for it before the second model's "no"
// stands: nothing is urgent about the writing
export const WRITING_WAIT_MS = 6 * 60 * 60 * 1000;

// After this many send-backs for the same check, the two models must agree
// that it fails before the child is sent back for it again
export const RECHECK_AFTER = 3;

// The revise checks, in a teacher's order, and the checks that count
// send-backs (grammar too)
export const REVISE_CHECKS = ["onTopic", "technique", "shows"] as const;
export type ReviseCheck = (typeof REVISE_CHECKS)[number];
export const CHECKS = [...REVISE_CHECKS, "grammar"] as const;
export type Check = (typeof CHECKS)[number];
// Checks counted for "no loop" (RECHECK_AFTER): the writing ones, and the
// gallery question when only one model says no
export type Counted = Check | "gallery";

// The writing checks the second model can tie with the first on, before
// an approval (the technique the Tell asks for is the code's and the
// first model's)
const TIE_CHECKS = ["onTopic", "shows", "grammar"] as const;

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
  sentBackFor?: Partial<Record<Counted, number>>;
  // The Show names a person by first name (rules.ts, namesAPerson): the
  // caller works it out from the words
  namesAPerson?: boolean;
  hosted?: HostedAnswer;
  // The hosted model's checklist, asked only when the two local models
  // disagree on the writing before an approval, and how long it's waited
  hostedChecklist?: ChecklistAnswer;
  writingWaitedMs?: number;
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
  | "model-failed" // a local model failed on these words again and again, before the child was known to be OK
  | "unknown-reason" // the rules held it for a reason this decider doesn't know
  | "undone"; // a teacher took Scribbles' decision back

export type Step =
  | { step: "approve"; tip: TipId }
  // check: the revise check it was sent back for, for the caller to count
  // teacher: also told to a teacher. "worry": both local models worried
  // and both say it's unkind about someone named, or one worried about a
  // sentence with personal details. "review": nothing is
  // wrong with the child, but Scribbles couldn't settle it (the models
  // keep splitting on the gallery question, or a model keeps failing on
  // the words): kept for the teacher to look over, while the child goes on
  | { step: "send-back"; tip: TipId; check?: Counted; teacher?: "worry" | "review" }
  | { step: "teacher"; because: TeacherBecause }
  | { step: "ask-local"; question: WelfareQuestion }
  // The second model's checklist, before an approval or to check a "no"
  | { step: "ask-second" }
  // redact: the sentence has personal details: the worker must hide
  // contact details (phone, email, username, address, school), keeping
  // ages and every other word, before sending it
  | { step: "ask-hosted"; question: WelfareQuestion; about: "worry"; redact?: true }
  // The checklist, to break a tie between the local models on the writing
  | { step: "ask-hosted"; about: "writing" };

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

const sentBackOften = (check: Counted, facts: Facts) => (facts.sentBackFor?.[check] ?? 0) >= RECHECK_AFTER;

// An answer that isn't one of the allowed values (null from a database, a
// half-saved checklist) is a missing one: asked again, never read as fine
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]) =>
  allowed.includes(value as T) ? (value as T) : undefined;
const validChecklist = (value: unknown) => (ChecklistAnswer.safeParse(value).success ? (value as ChecklistAnswer) : undefined);
const KNOWN_REASONS = new Set<string>(REASONS);

export const decide = (given: Facts): Step => {
  const facts: Facts = {
    ...given,
    safety: oneOf(given.safety, ["safe", "unsafe"] as const),
    welfare: { first: oneOf(given.welfare?.first, YES_NO), second: oneOf(given.welfare?.second, YES_NO) },
    checklist: validChecklist(given.checklist),
    second: validChecklist(given.second),
    hostedChecklist: validChecklist(given.hostedChecklist),
    hosted: oneOf(given.hosted?.concern, YES_NO) ? given.hosted : undefined,
  };
  const { rules, undone, safety, welfare = {}, checklist, second, hosted, failedTries = {} } = facts;
  const reasons: string[] = reasonsOf(rules);
  const question = welfareQuestion(rules);

  if (undone) return { step: "teacher", because: "undone" };
  // A reason added to the rules later, that this doesn't know what to do
  // with: a teacher, never a pass
  if (reasons.some((reason) => !KNOWN_REASONS.has(reason))) return { step: "teacher", because: "unknown-reason" };

  // 1. The rule checks. An explicit worrying phrase ("worrying" without
  // "sensitive-words") goes to a teacher and to no AI. Far too long: the
  // rules didn't read it at all (the API refuses to save one anyway).
  if (reasons.includes("worrying") && !reasons.includes("sensitive-words")) {
    return { step: "teacher", because: "worrying-words" };
  }
  if (reasons.includes("too-long")) return { step: "teacher", because: "too-long" };

  // A local model that keeps failing on these words. Once every reader has
  // said the child is OK, it's sent back to reword (and kept for the
  // teacher to look over); before that, a teacher, as a worry might hide
  // in the words no model could read
  const worries = [safety, welfare.first, welfare.second];
  if (READERS.some((reader) => (failedTries[reader] ?? 0) >= MAX_FAILED_TRIES)) {
    const allOk = safety === "safe" && welfare.first === "no" && welfare.second === "no";
    return allOk ? { step: "send-back", tip: "readAloud", teacher: "review" } : { step: "teacher", because: "model-failed" };
  }

  // Every local answer first: none is ever guessed
  if (worries.some((answer) => answer === undefined) || !checklist) return { step: "ask-local", question };

  // The hosted model, when it has been asked: a worry is final
  if (hosted?.concern === "yes") return { step: "teacher", because: "worry" };

  // 2. Is the child OK? Both local models worried: a teacher. When both
  // also say it's unkind about someone, the child is sent back to fix it
  // too. Only then: in the scores, one model's "unkind" alone was also
  // threats, self-harm and abuse, and a child who wrote about those must
  // never get a tip back.
  //
  // With personal details, both local models worrying isn't enough: a
  // phone number and "I'm home alone, I'm only 7" look the same to them.
  // The hosted model is asked: a worry (above) goes to a teacher, no
  // worry and it's sent back to take the details out. (The owner's
  // choice. The worker must take the details out of what it sends.)
  const personal = reasons.includes("personal-details");
  if (VOTERS.every((voter) => welfare[voter] === "yes")) {
    if (personal) {
      if (hosted) return { step: "send-back", tip: "privateDetails" };
      if ((facts.worryWaitedMs ?? 0) >= WORRY_WAIT_MS) return { step: "teacher", because: "worry-not-checked" };
      return { step: "ask-hosted", question, about: "worry", redact: true };
    }
    // Unkind about someone named ("Lucas", "Chloe's"), not the child
    // themselves ("I'm so ugly, nobody likes me" is a worry, never a tip)
    if (!reasons.includes("worrying") && !reasons.includes("unsafe-words") && facts.namesAPerson && safety === "safe" && checklist.suitable === "unkind") {
      if (!second) return { step: "ask-second" };
      if (second.suitable === "unkind") return { step: "send-back", tip: "kindWords", teacher: "worry" };
    }
    return { step: "teacher", because: "worry" };
  }
  const worrySplit = worries.some((answer) => answer === "unsafe" || answer === "yes");
  if (worrySplit && !hosted) {
    // One local model's worry about a sentence with personal details:
    // they're taken out first, and the new version is read afresh, by the
    // hosted model too if the local models still disagree. The worry is
    // kept for the teacher to look over, in case the new version leaves it
    // out (the owner's choice)
    if (personal && VOTERS.some((voter) => welfare[voter] === "yes")) {
      return { step: "send-back", tip: "privateDetails", teacher: "worry" };
    }
    if ((facts.worryWaitedMs ?? 0) >= WORRY_WAIT_MS) return { step: "teacher", because: "worry-not-checked" };
    // With personal details and only the safety model worried: it may be
    // the details themselves (its privacy category) or something worse
    // ("text me and I'll send pics"), so the hosted model is asked, with
    // the contact details hidden
    return personal ? { step: "ask-hosted", question, about: "worry", redact: true } : { step: "ask-hosted", question, about: "worry" };
  }

  // 3. Certain reasons to send it back
  const tip = certainTip(facts);
  if (tip) return { step: "send-back", tip };

  // 4. Fine for other children to read? Never a sentence the safety model
  // flagged (gory, harmful): the hosted model said the child is OK, not
  // that it's fine for the gallery. When the models keep splitting on it,
  // it's still sent back, and kept for the teacher to look over.
  if (safety === "unsafe") {
    return { step: "send-back", tip: "kindWords", check: "gallery", ...(sentBackOften("gallery", facts) ? { teacher: "review" as const } : {}) };
  }
  if (checklist.suitable !== "yes") {
    if (!sentBackOften("gallery", facts)) return { step: "send-back", tip: "kindWords", check: "gallery" };
    if (!second) return { step: "ask-second" };
    return { step: "send-back", tip: "kindWords", check: "gallery", ...(second.suitable === "yes" ? { teacher: "review" as const } : {}) };
  }

  // 5-6. The first model's checklist, first problem first. A "no" the
  // child has been sent back for often must be the second model's too.
  // "Off topic" with "doesn't show" is often a sentence that only says
  // the Tell again ("Our lunch was gross and yucky."): the second model
  // must agree it's off topic, or the child gets a detail tip instead.
  for (const check of CHECKS) {
    if (passes(check, checklist, facts)) continue;
    if (check === "onTopic" && checklist.shows === "no") {
      if (!second) return { step: "ask-second" };
      if (passes("onTopic", second, facts)) continue;
    }
    if (sentBackOften(check, facts)) {
      if (!second) return { step: "ask-second" };
      if (passes(check, second, facts)) continue;
    }
    return { step: "send-back", tip: tipFor(check, checklist, facts), check };
  }
  if (facts.writingTip) return { step: "send-back", tip: facts.writingTip };

  // 7. Before approving: the second model's checklist too
  if (!second) return { step: "ask-second" };
  if (second.suitable !== "yes") {
    return { step: "send-back", tip: "kindWords", check: "gallery", ...(sentBackOften("gallery", facts) ? { teacher: "review" as const } : {}) };
  }
  // A tie on the writing: the hosted model's checklist decides it. (A
  // check the models keep disagreeing on passes: see the top.)
  const tied = TIE_CHECKS.some((check) => !passes(check, second, facts) && !sentBackOften(check, facts));
  if (tied) {
    const { hostedChecklist } = facts;
    if (!hostedChecklist && (facts.writingWaitedMs ?? 0) < WRITING_WAIT_MS) return { step: "ask-hosted", about: "writing" };
    // The hosted model's answer on the tied checks only (topic, shows,
    // grammar). No answer in 6 hours: the second model's "no" stands, so a
    // missing answer is never read as fine.
    const judge = hostedChecklist ?? second;
    for (const check of TIE_CHECKS) {
      if (!passes(check, judge, facts) && !sentBackOften(check, facts)) {
        return { step: "send-back", tip: tipFor(check, judge, facts), check };
      }
    }
  }

  // 8. Ready for the gallery
  return { step: "approve", tip: PRAISE };
};
