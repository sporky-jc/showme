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
//   3. Each AI provider, in order, until one gives a valid answer. A
//      provider that fails, takes too long, has run out of free requests or
//      answers anything but the fixed form (contract.ts) is skipped.
//   4. Nobody could decide: "unsure", which leaves the sentence for a person,
//      exactly as if there were no AI at all.
//   5. The writing checks: spelling (spelling.ts), and capitals, end marks,
//      punctuation, repeated words and "a"/"an" (mechanics.ts). Mistakes are
//      listed for the teacher, and an approval becomes "redo" with the tip
//      for the first one, so a sentence with mistakes never reaches the
//      gallery. (Grammar a program can't check, the AI judges.)
//
// So no provider can break reviewing, and switching or adding one is a
// matter of the list passed in, not a change to the site.
import { ProviderAnswer, type AttemptOutcome, type Reason, type Suggestion } from "./contract.js";
import { MECHANIC_TIP, MECHANICS, mechanicsIssues } from "./mechanics.js";
import { ProviderError } from "./providers/http.js";
import { checkRules } from "./rules.js";
import { misspelledWords } from "./spelling.js";
import { PRAISE } from "./tips.js";

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
  { timeoutMs = PROVIDER_TIMEOUT_MS, safety }: { timeoutMs?: number; safety?: SafetyCheck } = {}
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
  // it's safe (step 2 above)
  if (rules.outcome === "redo") {
    const attempts: ProviderAttempt[] = [];
    const held = await checkSafety(shown, safety, timeoutMs, attempts);
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
  const { suggestion, attempts } = await askProviders(shown, providers, { timeoutMs, safety });
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
  if (suggestion.verdict !== "approve") return { suggestion: { ...suggestion, ...found }, attempts };

  // An approval becomes "redo", with the tip for the first kind of mistake:
  // spelling, then capitals, end marks, punctuation, then the rest
  const tip = misspelled.length > 0 ? "spelling" : MECHANIC_TIP[kinds[0]];
  return { suggestion: { ...suggestion, verdict: "redo", tip, ...found }, attempts };
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

// The safety check, then each provider in turn (steps 2 to 4 above)
const askProviders = async (
  shown: ReviewInput,
  providers: ReviewProvider[],
  { timeoutMs, safety }: { timeoutMs: number; safety?: SafetyCheck }
): Promise<ReviewResult> => {
  const attempts: ProviderAttempt[] = [];

  // No reviewer: nothing to ask, and nothing to check first
  if (providers.length === 0) {
    return {
      suggestion: { verdict: "unsure", tip: null, reasons: ["no-provider"], decidedBy: "none" },
      attempts,
    };
  }

  // The safety check first, and a sentence it hasn't passed never reaches a
  // reviewer
  const held = await checkSafety(shown, safety, timeoutMs, attempts);
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
