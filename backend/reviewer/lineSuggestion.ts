// What the review line would do with a sentence, as a suggestion on its
// Teacher page card (spec/SPEC-teacher-suggestions.md): the line's decided
// step in the form the card already reads (ScribblesSuggestion in
// contract/api.ts), and the trail of what each check said.
//
// No database and no clock: the caller hands in the line record, the rule
// checks' result and how many contact details the hosted model's
// questions had hidden.
// Model names and versions come from the saved answers, never from here,
// so a new model shows its own name the day it starts answering.
import type { Reason, Verdict } from "./contract.js";
import { ChecklistAnswer, TRAIL_CHECKS, TRAIL_QUESTIONS, TRAIL_SAID } from "./contract.js";
import type { RuleOutcome } from "./rules.js";
import type { TipId } from "./tips.js";

export interface TrailStep {
  check: (typeof TRAIL_CHECKS)[number];
  question: (typeof TRAIL_QUESTIONS)[number];
  said: (typeof TRAIL_SAID)[number];
  // The model's name and the short version code after "@", as the answer
  // was saved ("gemma4:e4b", "dc35e8d9"); the word check has none
  model?: string;
  version?: string;
  // What the rules held it for, or what a checklist found wrong
  found?: string[];
  // How many contact details were hidden before the hosted model read it
  hidden?: number;
  // This is why the sentence is on the teacher's page (or sent back)
  why: boolean;
}

export interface LineSuggestion {
  verdict: Verdict;
  tip: TipId | null;
  reasons: Reason[];
  teacher?: "worry" | "review";
  waiting?: true;
  trail: TrailStep[];
}

type Answer = { reader: string; question: string; model: string; answer: unknown };
type Decided = { step: string; tip?: string | null; check?: string | null; teacher?: string | null; because?: string | null };

export interface LineRecord {
  state: string;
  decided?: Decided | null;
  answers: Answer[];
}

const CHECK_OF_READER: Record<string, TrailStep["check"]> = { safety: "safety", first: "helper", second: "helper", hosted: "big-helper" };
const READER_ORDER = ["safety", "first", "second", "hosted"];
const QUESTION_ORDER = ["safety", "welfare", "danger", "realRisk", "checklist"];

// "gemma4:e4b@dc35e8d9c606" → name and short version; a name that starts
// with "@" (the hosted model's) has no version
export const splitModel = (model: string) => {
  const at = model.lastIndexOf("@");
  return at > 0 ? { model: model.slice(0, at), version: model.slice(at + 1, at + 9) } : { model };
};

const checklistFound = (value: unknown): string[] | undefined => {
  const parsed = ChecklistAnswer.safeParse(value);
  if (!parsed.success) return undefined;
  const c = parsed.data;
  return [
    c.suitable !== "yes" && "gallery",
    c.onTopic === "no" && "topic",
    c.technique === "no" && "technique",
    c.shows === "no" && "shows",
    c.grammar === "no" && "grammar",
  ].filter((found): found is string => Boolean(found));
};

// What one answer said, in the trail's words
const saidOf = (question: string, value: unknown): Pick<TrailStep, "said" | "found"> | undefined => {
  switch (question) {
    case "safety":
      return value === "safe" ? { said: "safe" } : value === "unsafe" ? { said: "unsafe" } : undefined;
    case "welfare":
    case "danger":
      return value === "yes" ? { said: "worried" } : value === "no" ? { said: "not-worried" } : undefined;
    case "realRisk":
      return value === "real" ? { said: "real" } : value === "not-real" ? { said: "not-real" } : undefined;
    case "checklist": {
      const found = checklistFound(value);
      if (!found) return undefined;
      return found.length ? { said: "found-problems", found } : { said: "all-good" };
    }
  }
  return undefined;
};

const WORRYING_SAID = new Set<TrailStep["said"]>(["unsafe", "worried", "real"]);

// The check a send-back was for, as a checklist finds it
const FOUND_FOR_CHECK: Record<string, string> = { gallery: "gallery", onTopic: "topic", technique: "technique", shows: "shows", grammar: "grammar" };

export const lineSuggestion = (line: LineRecord, rules: RuleOutcome, hostedHidden = 0): LineSuggestion => {
  // The word check first
  const words: TrailStep =
    rules.outcome === "pass"
      ? { check: "words", question: "rules", said: "nothing-found", why: false }
      : { check: "words", question: "rules", said: rules.outcome === "hold" ? "held" : "sent-back", found: rules.reasons, why: false };

  // Then each model's latest answer to each question, in the order they're asked
  const latest = new Map<string, Answer>();
  for (const a of line.answers) latest.set(`${a.reader} ${a.question}`, a);
  const asked = [...latest.values()].sort(
    (a, b) => READER_ORDER.indexOf(a.reader) - READER_ORDER.indexOf(b.reader) || QUESTION_ORDER.indexOf(a.question) - QUESTION_ORDER.indexOf(b.question)
  );
  const models: TrailStep[] = asked.flatMap((a) => {
    const said = saidOf(a.question, a.answer);
    const check = CHECK_OF_READER[a.reader];
    if (!said || !check) return [];
    const hidden = a.reader === "hosted" && hostedHidden > 0 ? { hidden: hostedHidden } : {};
    return [{ check, question: a.question as TrailStep["question"], ...said, ...splitModel(a.model), ...hidden, why: false }];
  });
  const trail = [words, ...models];

  const decided = line.state === "decided" ? line.decided : null;
  if (!decided) return { verdict: "unsure", tip: null, reasons: [], waiting: true, trail };

  const teacher = decided.teacher === "worry" || decided.teacher === "review" ? decided.teacher : undefined;
  const tip = (decided.tip ?? null) as TipId | null;
  const mark = (pick: (step: TrailStep) => boolean) => trail.forEach((step) => (step.why = pick(step)));

  switch (decided.step) {
    case "approve":
      return { verdict: "approve", tip, reasons: ["ai"], ...(teacher ? { teacher } : {}), trail };
    case "send-back": {
      if (rules.outcome !== "pass") mark((step) => step.check === "words");
      else if (decided.check && FOUND_FOR_CHECK[decided.check]) mark((step) => step.found?.includes(FOUND_FOR_CHECK[decided.check!]) === true);
      else mark((step) => step.said === "found-problems");
      return { verdict: "redo", tip, reasons: ["ai"], ...(teacher ? { teacher } : {}), trail };
    }
    case "teacher": {
      if (decided.because === "worrying-words") {
        mark((step) => step.check === "words");
        return { verdict: "unsure", tip: null, reasons: ["worrying"], trail };
      }
      if (decided.because === "worry" || decided.because === "worry-not-checked") {
        mark((step) => WORRYING_SAID.has(step.said));
        return { verdict: "unsure", tip: null, reasons: ["worrying", "welfare-check"], trail };
      }
      if (rules.outcome === "hold") mark((step) => step.check === "words");
      return { verdict: "unsure", tip: null, reasons: rules.outcome === "hold" ? rules.reasons : ["ai"], trail };
    }
  }
  return { verdict: "unsure", tip: null, reasons: ["ai"], trail };
};
