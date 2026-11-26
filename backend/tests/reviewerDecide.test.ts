import { describe, expect, it } from "vitest";
import {
  decide,
  MAX_FAILED_TRIES,
  READERS,
  VOTERS,
  WORRY_WAIT_MS,
  welfareQuestion,
  type Facts,
  type HostedAnswer,
} from "../reviewer/decide.js";
import type { ProviderAnswer } from "../reviewer/contract.js";
import type { RuleOutcome } from "../reviewer/rules.js";

// The decider (tasks/scribbles-worker-spec.md, "How one sentence is
// decided" and "When something is down"). Only made-up answers: no model,
// no sentence.

const PASS: RuleOutcome = { outcome: "pass" };
const hold = (...reasons: string[]): RuleOutcome => ({ outcome: "hold", reasons } as RuleOutcome);

const APPROVE: ProviderAnswer = { verdict: "approve", tip: "great" };
const REDO_SEE: ProviderAnswer = { verdict: "redo", tip: "see" };
const REDO_MORE: ProviderAnswer = { verdict: "redo", tip: "more" };
const UNSURE: ProviderAnswer = { verdict: "unsure", tip: "more" };

// Every local reader answered: no worry, both approve
const allIn = (more: Partial<Facts> = {}): Facts => ({
  rules: PASS,
  writingTip: null,
  safety: "safe",
  welfare: { first: "no", second: "no" },
  verdicts: { first: APPROVE, second: APPROVE },
  ...more,
});
const hosted = (concern: "yes" | "no", verdict: ProviderAnswer = APPROVE): HostedAnswer => ({ concern, verdict });

describe("step 1: the rule checks", () => {
  it("sends an explicit worrying phrase to a teacher, before any model is asked", () => {
    expect(decide({ rules: hold("worrying"), writingTip: null })).toEqual({ step: "teacher", because: "worrying-words" });
    // ... whatever else is known
    expect(decide(allIn({ rules: hold("worrying", "unkind") }))).toEqual({ step: "teacher", because: "worrying-words" });
  });

  it("lets the local models read a sentence held only for sensitive words", () => {
    expect(decide({ rules: hold("worrying", "sensitive-words"), writingTip: null })).toEqual({
      step: "ask-local",
      question: "welfare",
    });
    // "The dragon died in a ball of fire.": no worry, both approve
    expect(decide(allIn({ rules: hold("worrying", "sensitive-words") }))).toEqual({ step: "approve", tip: "great" });
  });

  it("sends a sentence the rules couldn't read at all to a teacher", () => {
    expect(decide({ rules: hold("too-long"), writingTip: null })).toEqual({ step: "teacher", because: "too-long" });
  });
});

describe("step 2: is the child OK?", () => {
  it("goes on when none of the three readers sees a worry", () => {
    expect(decide(allIn())).toEqual({ step: "approve", tip: "great" });
  });

  it("sends it to a teacher when all three see a worry", () => {
    expect(decide(allIn({ safety: "unsafe", welfare: { first: "yes", second: "yes" } }))).toEqual({
      step: "teacher",
      because: "worry",
    });
  });

  it("sends it to a teacher when both local models see a worry, whatever the safety model says", () => {
    // The safety model looks for harmful words, not for a child who isn't OK
    expect(decide(allIn({ welfare: { first: "yes", second: "yes" } }))).toEqual({ step: "teacher", because: "worry" });
    // ... even with personal details, or rude words only
    expect(decide(allIn({ rules: hold("personal-details"), welfare: { first: "yes", second: "yes" } }))).toEqual({
      step: "teacher",
      because: "worry",
    });
    expect(decide(allIn({ rules: hold("unkind"), welfare: { first: "yes", second: "yes" } }))).toEqual({
      step: "teacher",
      because: "worry",
    });
  });

  it.each([
    ["the safety model alone", { safety: "unsafe" as const }],
    ["one local model", { welfare: { first: "yes" as const, second: "no" as const } }],
    ["two of the three", { safety: "unsafe" as const, welfare: { first: "no" as const, second: "yes" as const } }],
  ])("asks the hosted model when %s sees a worry", (_name, more) => {
    expect(decide(allIn(more))).toEqual({ step: "ask-hosted", question: "welfare", about: "worry" });
  });

  it("follows the hosted model on a split worry: a worry goes to a teacher", () => {
    expect(decide(allIn({ safety: "unsafe", hosted: hosted("yes") }))).toEqual({ step: "teacher", because: "worry" });
  });

  it("follows the hosted model on a split worry: no worry, and its verdict is final", () => {
    const split = { safety: "unsafe" as const };
    expect(decide(allIn({ ...split, hosted: hosted("no", APPROVE) }))).toEqual({ step: "approve", tip: "great" });
    expect(decide(allIn({ ...split, hosted: hosted("no", REDO_MORE) }))).toEqual({ step: "send-back", tip: "more" });
    expect(decide(allIn({ ...split, hosted: hosted("no", UNSURE) }))).toEqual({ step: "send-back", tip: "kindWords" });
  });

  it("never asks the hosted model about a sentence with personal details: a split worry goes to a teacher", () => {
    expect(decide(allIn({ rules: hold("personal-details"), safety: "unsafe" }))).toEqual({
      step: "teacher",
      because: "worry",
    });
  });

  it("sends a split worry to a teacher if the hosted model hasn't answered in 6 hours", () => {
    const split = { safety: "unsafe" as const };
    expect(decide(allIn({ ...split, worryWaitedMs: WORRY_WAIT_MS - 1 }))).toMatchObject({ step: "ask-hosted" });
    expect(decide(allIn({ ...split, worryWaitedMs: WORRY_WAIT_MS }))).toEqual({
      step: "teacher",
      because: "worry-not-checked",
    });
  });

  it("asks the stricter question only of a sentence held for rude or unkind words and nothing else", () => {
    expect(welfareQuestion(hold("unkind"))).toBe("danger");
    expect(welfareQuestion(hold("unsafe-words", "names-someone"))).toBe("danger");
    expect(welfareQuestion(hold("unkind", "worrying", "sensitive-words"))).toBe("welfare");
    expect(welfareQuestion(hold("unkind", "personal-details"))).toBe("welfare");
    expect(welfareQuestion(PASS)).toBe("welfare");
    expect(decide(allIn({ rules: hold("unkind"), safety: "unsafe" }))).toEqual({
      step: "ask-hosted",
      question: "danger",
      about: "worry",
    });
  });
});

describe("step 3: certain reasons to send it back", () => {
  it.each([
    ["personal details", hold("personal-details"), null, "privateDetails"],
    ["rude words", hold("unsafe-words"), null, "kindWords"],
    ["unkind words", hold("unkind", "names-someone"), null, "kindWords"],
    ["mostly not in English", hold("not-english"), null, "inEnglish"],
    ["a copy of the Tell", { outcome: "redo", tip: "ownWords", reasons: ["copies-tell"] } as RuleOutcome, null, "ownWords"],
  ] as const)("sends back %s with its tip, whatever the models said", (_name, rules, writingTip, tip) => {
    expect(decide(allIn({ rules, writingTip }))).toEqual({ step: "send-back", tip });
  });

  it("takes the first reason that fits, in the spec's order", () => {
    expect(decide(allIn({ rules: hold("personal-details", "unkind", "not-english") }))).toEqual({
      step: "send-back",
      tip: "privateDetails",
    });
    expect(decide(allIn({ rules: hold("unkind", "not-english"), writingTip: "spelling" }))).toEqual({
      step: "send-back",
      tip: "kindWords",
    });
  });

  it("still applies after the hosted model cleared a split worry", () => {
    expect(decide(allIn({ safety: "unsafe", hosted: hosted("no", APPROVE), writingTip: "endMark" }))).toEqual({
      step: "send-back",
      tip: "endMark",
    });
  });
});

describe("step 4: the verdict", () => {
  it("approves when both approve", () => {
    expect(decide(allIn())).toEqual({ step: "approve", tip: "great" });
  });

  it("sends back with the first model's tip when both say redo", () => {
    expect(decide(allIn({ verdicts: { first: REDO_SEE, second: REDO_MORE } }))).toEqual({ step: "send-back", tip: "see" });
  });

  it("sends back with the kind-words tip when both are unsure", () => {
    expect(decide(allIn({ verdicts: { first: UNSURE, second: UNSURE } }))).toEqual({
      step: "send-back",
      tip: "kindWords",
    });
  });

  it.each([
    ["approve and redo", APPROVE, REDO_MORE, "more"],
    ["redo and approve", REDO_SEE, APPROVE, "see"],
    ["approve and unsure", APPROVE, UNSURE, "kindWords"],
    ["unsure and redo", UNSURE, REDO_SEE, "kindWords"],
    ["redo and unsure", REDO_SEE, UNSURE, "see"],
  ])(
    "sends it back when they disagree (%s), with the tip of one that didn't approve: no hosted model",
    (_name, first, second, tip) => {
      expect(decide(allIn({ verdicts: { first, second } }))).toEqual({ step: "send-back", tip });
    }
  );

  it("follows the hosted model's verdict when it was asked about a worry, even if the local verdicts split", () => {
    const split = { verdicts: { first: APPROVE, second: REDO_MORE } };
    expect(decide(allIn({ ...split, hosted: hosted("no", APPROVE) }))).toEqual({ step: "approve", tip: "great" });
    expect(decide(allIn({ ...split, hosted: hosted("no", REDO_SEE) }))).toEqual({ step: "send-back", tip: "see" });
    expect(decide(allIn({ ...split, hosted: hosted("no", UNSURE) }))).toEqual({ step: "send-back", tip: "kindWords" });
    // It's asked about the child too: a worry goes to a teacher
    expect(decide(allIn({ ...split, hosted: hosted("yes", APPROVE) }))).toEqual({ step: "teacher", because: "worry" });
  });

  it("decides every try the same way: there's no limit on send-backs, and no rule for later versions", () => {
    // The facts hold no count of tries or versions, so none can change the step
    expect(Object.keys(allIn())).not.toContain("redoCount");
    expect(decide(allIn({ verdicts: { first: REDO_SEE, second: REDO_SEE } }))).toEqual({ step: "send-back", tip: "see" });
  });
});

describe("step 5: revise first, then clean up", () => {
  it("sends an approval back with the writing checks' tip: a mistake never reaches the gallery", () => {
    expect(decide(allIn({ writingTip: "spelling" }))).toEqual({ step: "send-back", tip: "spelling" });
  });

  it.each([
    ["off topic", { verdict: "redo", tip: "onTopic" }, "onTopic"],
    ["a detail to add", REDO_SEE, "see"],
    ["not for the gallery", UNSURE, "kindWords"],
  ] as const)("puts a model's tip to revise (%s) before the spelling tip", (_name, verdict, tip) => {
    const answer = verdict as ProviderAnswer;
    expect(decide(allIn({ writingTip: "spelling", verdicts: { first: answer, second: answer } }))).toEqual({
      step: "send-back",
      tip,
    });
  });

  it("joins a model's grammar tip and the writing checks' spelling tip into one", () => {
    const grammar: ProviderAnswer = { verdict: "redo", tip: "readAloud" };
    expect(decide(allIn({ writingTip: "spelling", verdicts: { first: grammar, second: grammar } }))).toEqual({
      step: "send-back",
      tip: "checkWriting",
    });
    // The same tip twice is still that tip
    const spelling: ProviderAnswer = { verdict: "redo", tip: "spelling" };
    expect(decide(allIn({ writingTip: "spelling", verdicts: { first: spelling, second: spelling } }))).toEqual({
      step: "send-back",
      tip: "spelling",
    });
  });

  it("still puts the certain reasons first: personal details before a model's tip", () => {
    expect(
      decide(allIn({ rules: hold("personal-details"), writingTip: "spelling", verdicts: { first: REDO_SEE, second: REDO_SEE } }))
    ).toEqual({ step: "send-back", tip: "privateDetails" });
  });
});

describe("when something is down", () => {
  it("leaves a version a teacher took back to the teacher", () => {
    expect(decide(allIn({ undone: true }))).toEqual({ step: "teacher", because: "undone" });
  });

  it("asks the local models again for any answer that hasn't come in", () => {
    expect(decide(allIn({ safety: undefined }))).toEqual({ step: "ask-local", question: "welfare" });
    expect(decide(allIn({ welfare: { first: "no" } }))).toEqual({ step: "ask-local", question: "welfare" });
    expect(decide(allIn({ verdicts: { second: APPROVE } }))).toEqual({ step: "ask-local", question: "welfare" });
  });

  it("never waits for the hosted model over a split verdict", () => {
    expect(decide(allIn({ verdicts: { first: APPROVE, second: UNSURE }, worryWaitedMs: 10 * WORRY_WAIT_MS }))).toEqual({
      step: "send-back",
      tip: "kindWords",
    });
  });

  it.each(READERS)("sends it to a teacher after the %s reader fails on these words again and again", (reader) => {
    expect(decide(allIn({ failedTries: { [reader]: MAX_FAILED_TRIES - 1 } }))).toEqual({ step: "approve", tip: "great" });
    expect(decide(allIn({ safety: undefined, failedTries: { [reader]: MAX_FAILED_TRIES } }))).toEqual({
      step: "teacher",
      because: "model-failed",
    });
  });

  it("never approves or sends back while any local answer is missing", () => {
    // Every way each of the five local answers can be missing, with every
    // other answer the most favorable it can be
    const parts = [
      (f: Facts) => ({ ...f, safety: undefined }),
      (f: Facts) => ({ ...f, welfare: { ...f.welfare, first: undefined } }),
      (f: Facts) => ({ ...f, welfare: { ...f.welfare, second: undefined } }),
      (f: Facts) => ({ ...f, verdicts: { ...f.verdicts, first: undefined } }),
      (f: Facts) => ({ ...f, verdicts: { ...f.verdicts, second: undefined } }),
    ];
    for (let mask = 1; mask < 1 << parts.length; mask++) {
      for (const writingTip of [null, "spelling"] as const) {
        for (const rules of [PASS, hold("unkind"), hold("personal-details"), hold("worrying", "sensitive-words")]) {
          let facts = allIn({ rules, writingTip, hosted: hosted("no", APPROVE) });
          parts.forEach((drop, i) => {
            if (mask & (1 << i)) facts = drop(facts);
          });
          expect(decide(facts)).toEqual({ step: "ask-local", question: welfareQuestion(rules) });
        }
      }
    }
  });

  it("names its readers and voters in one place", () => {
    expect(READERS).toEqual(["safety", ...VOTERS]);
  });
});
