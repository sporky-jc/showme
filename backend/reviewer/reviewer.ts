// Scribbles as a reviewer: one slot, with layers behind it.
//
//   1. The rule checks (rules.ts), on every sentence. They hold anything
//      unsafe or personal for a person, and send back the plain cases.
//   2. Each AI provider, in order, until one gives a valid answer. A
//      provider that fails, takes too long, has run out of free requests or
//      answers anything but the fixed form (contract.ts) is skipped.
//   3. Nobody could decide: "unsure", which leaves the sentence for a person,
//      exactly as if there were no AI at all.
//
// So no provider can break reviewing, and switching or adding one is a
// matter of the list passed in, not a change to the site.
import { ProviderAnswer, type Suggestion } from "./contract.js";
import { checkRules } from "./rules.js";
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

// How long one provider may take before the next one is asked
export const PROVIDER_TIMEOUT_MS = 10_000;

// What happened at each provider, for the logs (never shown to anyone)
export interface ProviderAttempt {
  provider: string;
  outcome: "answered" | "invalid" | "failed" | "timeout";
}

export interface ReviewResult {
  suggestion: Suggestion;
  attempts: ProviderAttempt[];
}

// Ask one provider, within the time limit; its answer exactly as it came
// (A symbol, so no answer a provider gives can be mistaken for it)
const TIMED_OUT = Symbol("timed out");

const ask = async (provider: ReviewProvider, input: ReviewInput, timeoutMs: number) => {
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
  { timeoutMs = PROVIDER_TIMEOUT_MS }: { timeoutMs?: number } = {}
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

  // Only the two texts are passed on, whatever else the caller's object holds
  const shown: ReviewInput = { tell: input.tell, show: input.show };
  const attempts: ProviderAttempt[] = [];
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
