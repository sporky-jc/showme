// Every local model's answer to every question about the made-up set
// (tasks/scribbles-worker-spec.md, T4), kept so the decider can be scored on
// them afterwards (T5) without asking the models again.
//
// One model per run: the safety model answers "safe or unsafe", and each
// voter answers the welfare question and gives a verdict. A voter is asked
// one question about every sentence before the next question: the model
// server only skips re-reading the long instructions when the same ones come
// back to back, which is most of the time a question takes.
//
// Answers are read as strictly as the live reviewer reads them: anything
// but the fixed form is "invalid". Rows are named by their place in
// DECIDE_SET, never by their words.
import { ProviderAnswer, WelfareAnswer } from "../contract.js";
import { decide, welfareQuestion } from "../decide.js";
import type { ReviewInput, WelfareQuestion } from "../reviewer.js";
import { checkRules, type RuleOutcome } from "../rules.js";
import type { DecideRow } from "./decideSet.js";

export type Failure = "invalid" | "failed" | "timeout";

export interface Collected {
  row: number;
  safety?: "safe" | "unsafe" | Failure;
  welfare?: "yes" | "no" | Failure;
  verdict?: ProviderAnswer | Failure;
  // How long each answer took, in milliseconds
  ms: Partial<Record<"safety" | "welfare" | "verdict", number>>;
}

// What a model is asked, raw: these throw on a failure, like the providers
export interface Asker {
  safety?: (input: ReviewInput, signal: AbortSignal) => Promise<"safe" | "unsafe">;
  welfare?: (input: ReviewInput, signal: AbortSignal, question: WelfareQuestion) => Promise<unknown>;
  verdict?: (input: ReviewInput, signal: AbortSignal) => Promise<unknown>;
}

// The sentences a model reads: all but the ones the decider sends straight
// to a teacher from the rule checks alone (an explicit worrying phrase, or
// far too long), which go to no AI
export const readByModels = (rules: RuleOutcome) => decide({ rules, writingTip: null }).step === "ask-local";

// Ask once, within the time limit. A failure is a value, never a throw:
// "timeout", "invalid" (it answered, but not in the fixed form: the
// providers throw a ProviderError marked invalid) or "failed".
type Asked<T> = { answer: T; ms: number } | { failure: Failure; ms: number };
const ask = async <T>(question: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<Asked<T>> => {
  const started = Date.now();
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const answer = await Promise.race([
      question(signal),
      new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
    ]);
    return { answer, ms: Date.now() - started };
  } catch (error) {
    const failure: Failure = signal.aborted
      ? "timeout"
      : (error as { invalid?: boolean } | null)?.invalid
        ? "invalid"
        : "failed";
    return { failure, ms: Date.now() - started };
  }
};

export const collectAnswers = async (
  set: DecideRow[],
  asker: Asker,
  { timeoutMs = 120_000, onProgress }: { timeoutMs?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<Collected[]> => {
  const rows = set
    .map((row, index) => ({ index, input: { tell: row.tell, show: row.show }, rules: checkRules(row.tell, row.show) }))
    .filter(({ rules }) => readByModels(rules));
  const collected = new Map<number, Collected>(rows.map(({ index }) => [index, { row: index, ms: {} }]));
  const passes = (["safety", "welfare", "verdict"] as const).filter((pass) => asker[pass]);
  const total = rows.length * passes.length;
  let done = 0;

  for (const pass of passes) {
    for (const { index, input, rules } of rows) {
      const entry = collected.get(index)!;
      if (pass === "safety") {
        const result = await ask((signal) => asker.safety!(input, signal), timeoutMs);
        entry.safety = "answer" in result ? result.answer : result.failure;
        entry.ms.safety = result.ms;
      } else if (pass === "welfare") {
        const result = await ask((signal) => asker.welfare!(input, signal, welfareQuestion(rules)), timeoutMs);
        if ("answer" in result) {
          const parsed = WelfareAnswer.safeParse(result.answer);
          entry.welfare = parsed.success ? parsed.data.concern : "invalid";
        } else entry.welfare = result.failure;
        entry.ms.welfare = result.ms;
      } else {
        const result = await ask((signal) => asker.verdict!(input, signal), timeoutMs);
        if ("answer" in result) {
          const parsed = ProviderAnswer.safeParse(result.answer);
          entry.verdict = parsed.success ? parsed.data : "invalid";
        } else entry.verdict = result.failure;
        entry.ms.verdict = result.ms;
      }
      onProgress?.(++done, total);
    }
  }
  return [...collected.values()];
};

// A short summary for the run's page: counts only, never a sentence
export const summaryOf = (model: string, collected: Collected[]) => {
  const tally = (pick: (c: Collected) => unknown) => {
    const counts = new Map<string, number>();
    for (const c of collected) {
      const value = pick(c);
      if (value === undefined) continue;
      const key = typeof value === "object" ? (value as ProviderAnswer).verdict : String(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts].map(([key, n]) => `${key} ${n}`).join(", ") || "not asked";
  };
  const average = (pick: (c: Collected) => number | undefined) => {
    const values = collected.map(pick).filter((v): v is number => v !== undefined);
    return values.length ? `${(values.reduce((a, b) => a + b, 0) / values.length / 1000).toFixed(1)} s` : "-";
  };
  return [
    `## Answers from ${model}`,
    "",
    `${collected.length} made-up sentences read (the rest go to a teacher before any model).`,
    "",
    `- Safety: ${tally((c) => c.safety)}; average ${average((c) => c.ms.safety)}`,
    `- Welfare: ${tally((c) => c.welfare)}; average ${average((c) => c.ms.welfare)}`,
    `- Verdict: ${tally((c) => c.verdict)}; average ${average((c) => c.ms.verdict)}`,
  ].join("\n");
};
