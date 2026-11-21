// Scribbles as a reviewer: one slot, with layers behind it.
//
//   1. The rule checks (rules.ts), on every sentence. They hold anything
//      unsafe or personal for a person (held sentences go no further: no
//      AI, not even the safety check, ever sees them), and find the one
//      plain case, a copy of the Tell.
//   2. The AI safety check: a model that only judges whether the sentence is
//      safe. Unsafe, or no answer (not set up, failed, too slow, out of free
//      requests), and it's held for a person: no AI reviewer reads it. A
//      copy of the Tell the rules found is only sent back once this check
//      says it's safe: "It is cold outside, help me." copies the Tell, and
//      must still be read by a person if it's worrying.
//   3. The AI welfare check: a model asked one question only, "could the
//      child who wrote this be at risk, unsafe, neglected or in distress?"
//      The safety check catches what is plainly harmful; this catches the
//      hints a safety check and a writing reviewer both read past ("I gave
//      my bike and my books away to my friends.", "I'm not allowed to tell
//      anyone about my online friend."). It runs on every sentence the
//      safety check passed, the rules' copies of the Tell too, before any
//      reviewer's verdict is used. It fails closed: "yes", or no clear "no"
//      (not set up, failed, too slow, out of free requests, an answer in any
//      other form), and the sentence is held for a person as worrying, so
//      it's shown first ("Check in"), and no AI reviewer's verdict is used.
//   4. Each AI provider, in order, until one gives a valid answer. A
//      provider that fails, takes too long, has run out of free requests or
//      answers anything but the fixed form (contract.ts) is skipped.
//   5. Nobody could decide: "unsure", which leaves the sentence for a person,
//      exactly as if there were no AI at all.
//   6. The writing checks: spelling (spelling.ts), and capitals, end marks,
//      punctuation, repeated words and "a"/"an" (mechanics.ts). Mistakes are
//      listed for the teacher, and an approval becomes "redo", so a
//      sentence with mistakes never reaches the gallery. (Grammar a program
//      can't check, the AI judges.) Their tip comes before the AI's (see
//      writingTip below).
//   7. The limit on send-backs: a sentence already sent back twice
//      (MAX_SEND_BACKS) is never suggested for a third "Try again". It's
//      left for a person ("unsure", "redo-limit") instead.
//
// So no provider can break reviewing, and switching or adding one is a
// matter of the list passed in, not a change to the site.
import { ProviderAnswer, WelfareAnswer, type AttemptOutcome, type Reason, type Suggestion } from "./contract.js";
import { MECHANIC_TIP, MECHANICS, mechanicsIssues, type Mechanic } from "./mechanics.js";
import { ProviderError } from "./providers/http.js";
import { checkRules } from "./rules.js";
import { misspelledWords } from "./spelling.js";
import { PRAISE, type TipId } from "./tips.js";

// What a provider is shown: the Tell and the student's sentence, and nothing
// else (no names, emails or ids)
export interface ReviewInput {
  tell: string;
  show: string;
}

// An AI provider. `review` returns its raw answer, which the reviewer checks;
// it must give up when `signal` is aborted.
export interface ReviewProvider {
  name: string;
  review(input: ReviewInput, signal: AbortSignal): Promise<unknown>;
}

// The AI safety check: "safe" or "unsafe", or it throws
export interface SafetyCheck {
  name: string;
  check(input: ReviewInput, signal: AbortSignal): Promise<"safe" | "unsafe">;
}

// The AI welfare check (step 3 above). It returns its raw answer, which the
// reviewer checks against the fixed form (WelfareAnswer in contract.ts:
// {"concern": "yes"} or {"concern": "no"}), or it throws.
export interface WelfareCheck {
  name: string;
  check(input: ReviewInput, signal: AbortSignal): Promise<unknown>;
}

// The checks asked before any AI reviewer, and how long each may take
interface Checks {
  timeoutMs?: number;
  safety?: SafetyCheck;
  welfare?: WelfareCheck;
  // How many times this sentence has already been sent back for its day
  // (the sentence's redoCount, models/sentences.ts)
  sentBack?: number;
}

// How many times one sentence may be sent back with "Try again". A child
// fixes one thing per try; after two, another "Try again" is more likely to
// make them give up than to help, so Scribbles leaves the sentence to a
// person. Kept here, where the suggestion is made, so it holds the same once
// Scribbles sends sentences back on its own.
export const MAX_SEND_BACKS = 2;

// The tips that ask for a new sentence, not a fix to this one: the writing
// checks' tip doesn't go before these, since the words it's about are about
// to be replaced
const REWRITE_TIPS = new Set<TipId>(["onTopic", "ownWords"]);

// How long one provider may take before the next one is asked
export const PROVIDER_TIMEOUT_MS = 10_000;

// What happened at each provider, for the logs and the teacher's audit trail
// (saved with the suggestion, never sent to anyone's browser)
export interface ProviderAttempt {
  provider: string;
  outcome: AttemptOutcome;
  // How long it took, in milliseconds
  ms: number;
}

export interface ReviewResult {
  suggestion: Suggestion;
  attempts: ProviderAttempt[];
}

// Ask one provider, within the time limit; its answer exactly as it came
// (A symbol, so no answer a provider gives can be mistaken for it)
const TIMED_OUT = Symbol("timed out");

// Why a request failed, from the error it threw: out of free requests (HTTP
// 429), a wrong key or one without permission (401, 403), an answer in the
// wrong form, or anything else
const failureOf = (error: unknown) => {
  if (error instanceof ProviderError) {
    if (error.status === 429) return "rate-limited" as const;
    if (error.status === 401 || error.status === 403) return "credentials" as const;
    // Not found, wrong method, too slow, a clash, too early: nothing to do
    // with this sentence, so tried again like any failure
    if (error.status !== undefined && [404, 405, 408, 409, 425].includes(error.status)) return "failed" as const;
    // Any other 4xx: the API got the request and won't take it (an input
    // it can't read, say). It will answer the same way next time.
    if (error.status !== undefined && error.status >= 400 && error.status < 500) return "refused" as const;
    if (error.invalid) return "invalid" as const;
  }
  return "failed" as const;
};

const ask = async (
  provider: { review: (input: ReviewInput, signal: AbortSignal) => Promise<unknown> },
  input: ReviewInput,
  timeoutMs: number
) => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      // Settle as a timeout first: a provider that gives up on the abort
      // would otherwise be counted as failed
      resolve(TIMED_OUT);
      controller.abort();
    }, timeoutMs);
  });
  try {
    const answer = await Promise.race([provider.review(input, controller.signal), timeout]);
    const ms = Date.now() - started;
    return answer === TIMED_OUT ? ({ kind: "timeout", ms } as const) : ({ kind: "answer", answer, ms } as const);
  } catch (error) {
    return { kind: failureOf(error), ms: Date.now() - started } as const;
  } finally {
    clearTimeout(timer);
  }
};

export const reviewSentence = async (
  input: ReviewInput,
  providers: ReviewProvider[],
  checks: Checks = {}
): Promise<ReviewResult> => {
  const { suggestion, attempts } = await suggest(input, providers, checks);
  return { suggestion: withinSendBacks(suggestion, checks.sentBack ?? 0), attempts };
};

// Step 7 above: a "redo" for a sentence already sent back MAX_SEND_BACKS
// times becomes "unsure", for a person, whoever suggested it (the rules,
// the AI or the writing checks). Its tip goes (a person picks one, if any),
// and the mistakes found stay as evidence for the teacher. An approval is
// still an approval, and a hold is already "unsure", with its own reasons.
const withinSendBacks = (suggestion: Suggestion, sentBack: number): Suggestion =>
  suggestion.verdict === "redo" && sentBack >= MAX_SEND_BACKS
    ? { ...suggestion, verdict: "unsure", tip: null, reasons: [...suggestion.reasons, "redo-limit"] }
    : suggestion;

// The one tip for the writing checks' mistakes. A child fixes one thing per
// "Try again", and there are only MAX_SEND_BACKS of them, so the first tip
// should get the most done: one kind of mistake gets its own tip (it says
// exactly what to do), and more than one kind gets "checkWriting", which
// covers them all at once, rather than one tip per try for spelling, then
// capitals, then the period.
const writingTip = (misspelled: string[], kinds: Mechanic[]): TipId => {
  const tips = new Set<TipId>(kinds.map((kind) => MECHANIC_TIP[kind]));
  if (misspelled.length > 0) tips.add("spelling");
  return tips.size === 1 ? [...tips][0] : "checkWriting";
};

const suggest = async (
  input: ReviewInput,
  providers: ReviewProvider[],
  { timeoutMs = PROVIDER_TIMEOUT_MS, safety, welfare }: Checks
): Promise<ReviewResult> => {
  // Only the two texts are passed on, whatever else the caller's object holds
  const shown: ReviewInput = { tell: input.tell, show: input.show };
  const rules = checkRules(shown.tell, shown.show);
  // Held: nothing more is asked, and nothing leaves our systems
  if (rules.outcome === "hold") {
    return {
      suggestion: { verdict: "unsure", tip: null, reasons: rules.reasons, decidedBy: "rules" },
      attempts: [],
    };
  }

  // A copy of the Tell: sent back, but only once the safety check has said
  // it's safe and the welfare check has seen nothing worrying (steps 2 and 3
  // above)
  if (rules.outcome === "redo") {
    const attempts: ProviderAttempt[] = [];
    const held = await checkFirst(shown, { safety, welfare }, timeoutMs, attempts);
    if (held) return { suggestion: held, attempts };
    return {
      suggestion: { verdict: "redo", tip: rules.tip, reasons: rules.reasons, decidedBy: "rules" },
      attempts,
    };
  }

  // The writing checks, for the teacher, and so a sentence with mistakes is
  // never approved into the gallery. They're checked here, after the rules'
  // safety checks, and only ever stop an approval (spelling.ts, mechanics.ts).
  const misspelled = misspelledWords(shown.show);
  const mechanics = mechanicsIssues(shown.show);
  const { suggestion, attempts } = await askProviders(shown, providers, { timeoutMs, safety, welfare });
  if (misspelled.length === 0 && mechanics.length === 0) return { suggestion, attempts };

  // The mistakes found, as evidence for the teacher, whatever the verdict.
  // And why, for an approval turned back or a "redo" from the AI (so the
  // teacher sees the spelling and punctuation reasons too); a hold
  // ("unsure") keeps only the reasons it was held for.
  const kinds = MECHANICS.filter((kind) => mechanics.some((issue) => issue.kind === kind));
  const reasons: Reason[] = [...suggestion.reasons];
  if (suggestion.verdict !== "unsure") {
    if (misspelled.length > 0) reasons.push("spelling");
    if (kinds.some((kind) => kind !== "repeated-word" && kind !== "a-an")) reasons.push("punctuation");
    if (kinds.some((kind) => kind === "repeated-word" || kind === "a-an")) reasons.push("grammar");
  }
  const found = {
    reasons,
    ...(misspelled.length > 0 ? { misspelled } : {}),
    ...(mechanics.length > 0 ? { mechanics } : {}),
  };
  if (suggestion.verdict === "unsure") return { suggestion: { ...suggestion, ...found }, attempts };

  // An approval becomes "redo". So does a "redo" from the AI, but with the
  // writing checks' tip in place of the AI's (unless the AI asks for a new
  // sentence): those mistakes are certain, quick to fix and keep a sentence
  // out of the gallery whatever else is right, while the AI's tip about
  // detail or style is a judgement, and can come on the next try once the
  // writing is clean.
  if (suggestion.verdict === "redo" && suggestion.tip && REWRITE_TIPS.has(suggestion.tip)) {
    return { suggestion: { ...suggestion, ...found }, attempts };
  }
  return { suggestion: { ...suggestion, verdict: "redo", tip: writingTip(misspelled, kinds), ...found }, attempts };
};

// The safety check (step 2 above). Its answer is added to `attempts`; it
// gives back the hold to save unless the sentence is safe.
const checkSafety = async (
  shown: ReviewInput,
  safety: SafetyCheck | undefined,
  timeoutMs: number,
  attempts: ProviderAttempt[]
): Promise<Suggestion | null> => {
  if (!safety) return { verdict: "unsure", tip: null, reasons: ["no-safety-check"], decidedBy: "none" };
  const checked = await ask({ review: (i, signal) => safety.check(i, signal) }, shown, timeoutMs);
  const safe =
    checked.kind === "answer" && (checked.answer === "safe" || checked.answer === "unsafe") ? checked.answer : null;
  attempts.push({
    provider: safety.name,
    outcome: safe ?? (checked.kind === "answer" ? "invalid" : checked.kind),
    ms: checked.ms,
  });
  if (safe === "unsafe") return { verdict: "unsure", tip: null, reasons: ["safety-check"], decidedBy: safety.name };
  if (safe !== "safe") return { verdict: "unsure", tip: null, reasons: ["no-safety-check"], decidedBy: "none" };
  return null;
};

// The welfare check (step 3 above), once the safety check has said safe. Its
// answer is added to `attempts`; it gives back the hold to save unless the
// answer is exactly "no". A hold is always "worrying": the check said "yes",
// or it couldn't say "no", and either way a person should read it first.
const checkWelfare = async (
  shown: ReviewInput,
  welfare: WelfareCheck | undefined,
  timeoutMs: number,
  attempts: ProviderAttempt[]
): Promise<Suggestion | null> => {
  const unchecked: Suggestion = {
    verdict: "unsure",
    tip: null,
    reasons: ["worrying", "no-welfare-check"],
    decidedBy: "none",
  };
  if (!welfare) return unchecked;
  const checked = await ask({ review: (i, signal) => welfare.check(i, signal) }, shown, timeoutMs);
  const parsed = checked.kind === "answer" ? WelfareAnswer.safeParse(checked.answer) : undefined;
  const concern = parsed?.success ? parsed.data.concern : null;
  attempts.push({
    provider: welfare.name,
    outcome: concern === "yes" ? "concern" : concern === "no" ? "no-concern" : checked.kind === "answer" ? "invalid" : checked.kind,
    ms: checked.ms,
  });
  if (concern === "yes") {
    return { verdict: "unsure", tip: null, reasons: ["worrying", "welfare-check"], decidedBy: welfare.name };
  }
  if (concern !== "no") return unchecked;
  return null;
};

// The checks before any AI reviewer's verdict is used: the safety check,
// then, only if it said safe, the welfare check (steps 2 and 3 above)
const checkFirst = async (
  shown: ReviewInput,
  { safety, welfare }: { safety?: SafetyCheck; welfare?: WelfareCheck },
  timeoutMs: number,
  attempts: ProviderAttempt[]
): Promise<Suggestion | null> =>
  (await checkSafety(shown, safety, timeoutMs, attempts)) ?? (await checkWelfare(shown, welfare, timeoutMs, attempts));

// The safety and welfare checks, then each provider in turn (steps 2 to 5
// above)
const askProviders = async (
  shown: ReviewInput,
  providers: ReviewProvider[],
  { timeoutMs, safety, welfare }: { timeoutMs: number; safety?: SafetyCheck; welfare?: WelfareCheck }
): Promise<ReviewResult> => {
  const attempts: ProviderAttempt[] = [];

  // No reviewer: nothing to ask, and nothing to check first
  if (providers.length === 0) {
    return {
      suggestion: { verdict: "unsure", tip: null, reasons: ["no-provider"], decidedBy: "none" },
      attempts,
    };
  }

  // The safety and welfare checks first: a sentence either holds is never
  // sent to a reviewer
  const held = await checkFirst(shown, { safety, welfare }, timeoutMs, attempts);
  if (held) return { suggestion: held, attempts };

  for (const provider of providers) {
    const result = await ask(provider, shown, timeoutMs);
    if (result.kind !== "answer") {
      attempts.push({ provider: provider.name, outcome: result.kind, ms: result.ms });
      continue;
    }
    const parsed = ProviderAnswer.safeParse(result.answer);
    if (!parsed.success) {
      attempts.push({ provider: provider.name, outcome: "invalid", ms: result.ms });
      continue;
    }
    attempts.push({ provider: provider.name, outcome: "answered", ms: result.ms });
    const { verdict, tip } = parsed.data;
    return {
      suggestion: {
        verdict,
        tip: verdict === "unsure" ? null : verdict === "approve" ? PRAISE : tip,
        reasons: ["ai"],
        decidedBy: provider.name,
      },
      attempts,
    };
  }

  return {
    suggestion: { verdict: "unsure", tip: null, reasons: ["no-provider"], decidedBy: "none" },
    attempts,
  };
};
