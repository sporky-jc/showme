// Scribbles as a reviewer: one slot, with layers behind it.
//
//   1. The rule checks (rules.ts), on every sentence. They hold anything
//      unsafe or personal for a person, and send back the plain cases.
//   2. The AI safety check: a model that only judges whether the sentence is
//      safe. Unsafe, or no answer (not set up, failed, too slow, out of free
//      requests), and it's held for a person: no AI reviewer reads it.
//   3. Each AI provider, in order, until one gives a valid answer. A
//      provider that fails, takes too long, has run out of free requests or
//      answers anything but the fixed form (contract.ts) is skipped.
//   4. Nobody could decide: "unsure", which leaves the sentence for a person,
//      exactly as if there were no AI at all.
//   5. Spelling (spelling.ts): words not in the dictionary are listed for
//      the teacher, and an approval becomes "redo" with the spelling tip, so
//      a sentence with mistakes never reaches the gallery.
//
// So no provider can break reviewing, and switching or adding one is a
// matter of the list passed in, not a change to the site.
import { ProviderAnswer, type Suggestion } from "./contract.js";
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

// What happened at each provider, for the logs (never shown to anyone)
export interface ProviderAttempt {
  provider: string;
  outcome: "answered" | "invalid" | "failed" | "timeout" | "safe" | "unsafe";
}

export interface ReviewResult {
  suggestion: Suggestion;
  attempts: ProviderAttempt[];
}

// Ask one provider, within the time limit; its answer exactly as it came
// (A symbol, so no answer a provider gives can be mistaken for it)
const TIMED_OUT = Symbol("timed out");

const ask = async (
  provider: { review: (input: ReviewInput, signal: AbortSignal) => Promise<unknown> },
  input: ReviewInput,
  timeoutMs: number
) => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
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
    return answer === TIMED_OUT ? ({ kind: "timeout" } as const) : ({ kind: "answer", answer } as const);
  } catch {
    return { kind: "failed" } as const;
  } finally {
    clearTimeout(timer);
  }
};

export const reviewSentence = async (
  input: ReviewInput,
  providers: ReviewProvider[],
  { timeoutMs = PROVIDER_TIMEOUT_MS, safety }: { timeoutMs?: number; safety?: SafetyCheck } = {}
): Promise<ReviewResult> => {
  const rules = checkRules(input.tell, input.show);
  if (rules.outcome === "hold") {
    return {
      suggestion: { verdict: "unsure", tip: null, reasons: rules.reasons, decidedBy: "rules" },
      attempts: [],
    };
  }
  if (rules.outcome === "redo") {
    return {
      suggestion: { verdict: "redo", tip: rules.tip, reasons: rules.reasons, decidedBy: "rules" },
      attempts: [],
    };
  }

  // Spelling, for the teacher, and so a sentence with mistakes is never
  // approved into the gallery. It's checked here, after the rules' safety
  // checks, and only ever stops an approval (spelling.ts).
  const misspelled = misspelledWords(input.show);
  const { suggestion, attempts } = await askProviders(input, providers, { timeoutMs, safety });
  if (misspelled.length === 0) return { suggestion, attempts };
  if (suggestion.verdict === "approve") {
    return {
      suggestion: { ...suggestion, verdict: "redo", tip: "spelling", reasons: [...suggestion.reasons, "spelling"], misspelled },
      attempts,
    };
  }
  return { suggestion: { ...suggestion, misspelled }, attempts };
};

// The safety check, then each provider in turn (steps 2 to 4 above)
const askProviders = async (
  input: ReviewInput,
  providers: ReviewProvider[],
  { timeoutMs, safety }: { timeoutMs: number; safety?: SafetyCheck }
): Promise<ReviewResult> => {
  // Only the two texts are passed on, whatever else the caller's object holds
  const shown: ReviewInput = { tell: input.tell, show: input.show };
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
  if (!safety) {
    return {
      suggestion: { verdict: "unsure", tip: null, reasons: ["no-safety-check"], decidedBy: "none" },
      attempts,
    };
  }
  const checked = await ask({ review: (i, signal) => safety.check(i, signal) }, shown, timeoutMs);
  const safe = checked.kind === "answer" && (checked.answer === "safe" || checked.answer === "unsafe") ? checked.answer : null;
  attempts.push({ provider: safety.name, outcome: safe ?? (checked.kind === "answer" ? "invalid" : checked.kind) });
  if (safe === "unsafe") {
    return {
      suggestion: { verdict: "unsure", tip: null, reasons: ["safety-check"], decidedBy: safety.name },
      attempts,
    };
  }
  if (safe !== "safe") {
    return {
      suggestion: { verdict: "unsure", tip: null, reasons: ["no-safety-check"], decidedBy: "none" },
      attempts,
    };
  }

  for (const provider of providers) {
    const result = await ask(provider, shown, timeoutMs);
    if (result.kind !== "answer") {
      attempts.push({ provider: provider.name, outcome: result.kind });
      continue;
    }
    const parsed = ProviderAnswer.safeParse(result.answer);
    if (!parsed.success) {
      attempts.push({ provider: provider.name, outcome: "invalid" });
      continue;
    }
    attempts.push({ provider: provider.name, outcome: "answered" });
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
