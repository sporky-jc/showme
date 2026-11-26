import { describe, expect, it } from "vitest";
import { collectAnswers, readByModels, summaryOf, type Asker } from "../reviewer/eval/collect.js";
import type { DecideRow } from "../reviewer/eval/decideSet.js";
import { checkRules } from "../reviewer/rules.js";
import { ProviderError } from "../reviewer/providers/http.js";

// Collecting every local model's answer to the made-up set
// (reviewer/eval/collect.ts, T4), with fake models: no request is sent.

const COLD = "It is cold outside.";
const row = (show: string, expect: DecideRow["expect"] = "approve"): DecideRow => ({ tell: COLD, show, expect, kind: "test" });
const SET: DecideRow[] = [
  row("My breath puffed out like a little cloud."),
  row("I cut my arm again last night.", "teacher"), // an explicit worrying phrase: no model reads it
  row("Liam is so fat and stupid.", "send-back"), // rude only: the stricter welfare question
  row("Icicles hung from the roof like teeth."),
];

describe("which sentences the models read", () => {
  it("leaves out what the rule checks send straight to a teacher", () => {
    expect(readByModels(checkRules(COLD, "I cut my arm again last night."))).toBe(false);
    expect(readByModels(checkRules(COLD, "x".repeat(700)))).toBe(false);
    expect(readByModels(checkRules(COLD, "My dad smokes weed every night."))).toBe(true); // sensitive words only
    expect(readByModels(checkRules(COLD, "Liam is so fat and stupid."))).toBe(true);
    expect(readByModels(checkRules(COLD, "Icicles hung from the roof like teeth."))).toBe(true);
  });
});

describe("collectAnswers", () => {
  it("asks one question about every sentence before the next question, and never the explicit worry", async () => {
    const asked: string[] = [];
    const asker: Asker = {
      welfare: async ({ show }, _signal, question) => {
        asked.push(`welfare:${question}:${show}`);
        return { concern: "no" };
      },
      verdict: async ({ show }) => {
        asked.push(`verdict:${show}`);
        return { verdict: "approve", tip: "great" };
      },
    };

    const collected = await collectAnswers(SET, asker);

    expect(asked).toEqual([
      "welfare:welfare:My breath puffed out like a little cloud.",
      "welfare:danger:Liam is so fat and stupid.",
      "welfare:welfare:Icicles hung from the roof like teeth.",
      "verdict:My breath puffed out like a little cloud.",
      "verdict:Liam is so fat and stupid.",
      "verdict:Icicles hung from the roof like teeth.",
    ]);
    expect(collected.map((c) => c.row)).toEqual([0, 2, 3]);
    expect(collected[0]).toMatchObject({ row: 0, welfare: "no", verdict: { verdict: "approve", tip: "great" } });
    expect(collected[0].safety).toBeUndefined();
  });

  it("splits the sentences the models read into parts that cover each one once", async () => {
    const asker: Asker = { safety: async () => "safe" };
    const first = await collectAnswers(SET, asker, { part: { index: 1, of: 2 } });
    const second = await collectAnswers(SET, asker, { part: { index: 2, of: 2 } });

    expect(first.map((c) => c.row)).toEqual([0, 3]);
    expect(second.map((c) => c.row)).toEqual([2]);
  });

  it("hands over every answer so far after each question, so a job out of time keeps them", async () => {
    const saved: string[][] = [];
    const asker: Asker = {
      welfare: async () => ({ concern: "no" }),
      verdict: async () => ({ verdict: "approve", tip: "great" }),
    };

    await collectAnswers(SET, asker, {
      onPassDone: (collected) => saved.push(collected.map((c) => `${c.welfare ?? "-"}/${typeof c.verdict}`)),
    });

    expect(saved).toEqual([
      ["no/undefined", "no/undefined", "no/undefined"],
      ["no/object", "no/object", "no/object"],
    ]);
  });

  it("reads answers strictly: anything but the fixed form is invalid", async () => {
    const answers = [{ concern: "maybe" }, { concern: "no", why: "fine" }, { concern: "yes" }];
    const verdicts = [{ verdict: "approve", tip: "more" }, "approve", { verdict: "redo", tip: "see" }];
    let i = 0;
    let j = 0;
    const collected = await collectAnswers(SET, {
      welfare: async () => answers[i++],
      verdict: async () => verdicts[j++],
    });
    expect(collected.map((c) => c.welfare)).toEqual(["invalid", "invalid", "yes"]);
    expect(collected.map((c) => c.verdict)).toEqual(["invalid", "invalid", { verdict: "redo", tip: "see" }]);
  });

  it("records the safety model's answer, and an answer it can't read as invalid", async () => {
    let i = 0;
    const collected = await collectAnswers(SET, {
      safety: async () => {
        i++;
        if (i === 2) throw new ProviderError("Unexpected answer from the safety check", undefined, true);
        return i === 1 ? "safe" : "unsafe";
      },
    });
    expect(collected.map((c) => c.safety)).toEqual(["safe", "invalid", "unsafe"]);
    expect(collected[0].welfare).toBeUndefined();
  });

  it("records a model that fails or takes too long, and carries on", async () => {
    let i = 0;
    const collected = await collectAnswers(
      SET,
      {
        safety: async (_input, signal) => {
          i++;
          if (i === 1) throw new ProviderError("HTTP 500", 500);
          if (i === 2) return new Promise((resolve) => signal.addEventListener("abort", () => resolve("safe")));
          return "safe";
        },
      },
      { timeoutMs: 20 }
    );
    expect(collected.map((c) => c.safety)).toEqual(["failed", "timeout", "safe"]);
  });

  it("reports progress, and a summary with counts and no sentence", async () => {
    const progress: number[] = [];
    const collected = await collectAnswers(
      SET,
      { safety: async () => "safe" },
      { onProgress: (done, total) => progress.push(done / total) }
    );
    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
    const summary = summaryOf("llama-guard3:8b (safety)", collected);
    expect(summary).toContain("Safety: safe 3");
    for (const { show } of SET) expect(summary).not.toContain(show);
  });
});
