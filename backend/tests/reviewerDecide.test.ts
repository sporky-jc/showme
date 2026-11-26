import { describe, expect, it } from "vitest";
import {
  decide,
  MAX_FAILED_TRIES,
  READERS,
  RECHECK_AFTER,
  VOTERS,
  WORRY_WAIT_MS,
  welfareQuestion,
  type Facts,
  type HostedAnswer,
} from "../reviewer/decide.js";
import type { ChecklistAnswer } from "../reviewer/contract.js";
import type { RuleOutcome } from "../reviewer/rules.js";

// The decider (tasks/scribbles-worker-spec.md, "How one sentence is
// decided" and "When something is down"). Only made-up answers: no model,
// no sentence.

const PASS: RuleOutcome = { outcome: "pass" };
const hold = (...reasons: string[]): RuleOutcome => ({ outcome: "hold", reasons } as RuleOutcome);

// The writing checklist: all fine, or with one or more questions "no"
const GOOD: ChecklistAnswer = { onTopic: "yes", technique: "yes", shows: "yes", detail: "see", grammar: "yes" };
const saying = (more: Partial<ChecklistAnswer>): ChecklistAnswer => ({ ...GOOD, ...more });

// Every local reader answered: no worry, fine for the gallery, good writing
const allIn = (more: Partial<Facts> = {}): Facts => ({
  rules: PASS,
  writingTip: null,
  safety: "safe",
  welfare: { first: "no", second: "no" },
  suitable: { first: "yes", second: "yes" },
  checklist: GOOD,
  ...more,
});
const hosted = (concern: "yes" | "no"): HostedAnswer => ({ concern });

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
    // "The dragon died in a ball of fire.": no worry, fine, well written
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

  it("sends it to a teacher when both local models see a worry, whatever the safety model says", () => {
    // The safety model looks for harmful words, not for a child who isn't OK
    expect(decide(allIn({ welfare: { first: "yes", second: "yes" } }))).toEqual({ step: "teacher", because: "worry" });
    expect(decide(allIn({ safety: "unsafe", welfare: { first: "yes", second: "yes" } }))).toEqual({
      step: "teacher",
      because: "worry",
    });
    // ... even with personal details, rude words only, or bad writing
    for (const rules of [hold("personal-details"), hold("unkind")]) {
      expect(decide(allIn({ rules, welfare: { first: "yes", second: "yes" } }))).toEqual({
        step: "teacher",
        because: "worry",
      });
    }
    expect(
      decide(allIn({ checklist: saying({ onTopic: "no" }), writingTip: "spelling", welfare: { first: "yes", second: "yes" } }))
    ).toEqual({ step: "teacher", because: "worry" });
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

  it("goes on through the local steps when the hosted model sees no worry: it's asked nothing else", () => {
    const split = { safety: "unsafe" as const, hosted: hosted("no") };
    expect(decide(allIn(split))).toEqual({ step: "approve", tip: "great" });
    expect(decide(allIn({ ...split, checklist: saying({ shows: "no", detail: "hear" }) }))).toEqual({
      step: "send-back",
      tip: "hear",
      check: "shows",
    });
    expect(decide(allIn({ ...split, writingTip: "endMark" }))).toEqual({ step: "send-back", tip: "endMark" });
  });

  it("never asks the hosted model about a sentence with personal details: it's sent back to take them out", () => {
    const personal = hold("personal-details");
    // One local model worried
    expect(decide(allIn({ rules: personal, welfare: { first: "yes", second: "no" } }))).toEqual({
      step: "send-back",
      tip: "privateDetails",
    });
    // The safety model alone: it flags the details themselves, so it doesn't count
    expect(decide(allIn({ rules: personal, safety: "unsafe" }))).toEqual({ step: "send-back", tip: "privateDetails" });
    // Both local models worried: still a teacher
    expect(decide(allIn({ rules: personal, welfare: { first: "yes", second: "yes" } }))).toEqual({
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
    ["personal details", hold("personal-details"), "privateDetails"],
    ["rude words", hold("unsafe-words"), "kindWords"],
    ["unkind words", hold("unkind", "names-someone"), "kindWords"],
    ["mostly not in English", hold("not-english"), "inEnglish"],
    ["a copy of the Tell", { outcome: "redo", tip: "ownWords", reasons: ["copies-tell"] } as RuleOutcome, "ownWords"],
  ] as const)("sends back %s with its tip, whatever the models said of the writing", (_name, rules, tip) => {
    expect(decide(allIn({ rules }))).toEqual({ step: "send-back", tip });
    expect(decide(allIn({ rules, checklist: saying({ onTopic: "no" }), writingTip: "spelling" }))).toEqual({
      step: "send-back",
      tip,
    });
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
});

describe("step 4: fine for other children to read?", () => {
  it.each([
    ["the first model", { first: "unsure" as const, second: "yes" as const }],
    ["the second model", { first: "yes" as const, second: "unsure" as const }],
    ["both", { first: "unsure" as const, second: "unsure" as const }],
  ])("sends it back with the kind-words tip when %s is unsure, before anything about the writing", (_name, suitable) => {
    expect(decide(allIn({ suitable }))).toEqual({ step: "send-back", tip: "kindWords" });
    expect(decide(allIn({ suitable, checklist: saying({ onTopic: "no" }), writingTip: "spelling" }))).toEqual({
      step: "send-back",
      tip: "kindWords",
    });
  });
});

describe("step 5: revise, first problem first", () => {
  it("sends it back for being off topic first, whatever else is wrong", () => {
    const everything = saying({ onTopic: "no", technique: "no", shows: "no", grammar: "no" });
    expect(decide(allIn({ technique: "simile", checklist: everything, writingTip: "spelling" }))).toEqual({
      step: "send-back",
      tip: "onTopic",
      check: "onTopic",
    });
  });

  it.each([
    ["simile", "compare"],
    ["metaphor", "metaphor"],
    ["personification", "personification"],
    ["hyperbole", "hyperbole"],
    ["allusion", "allusion"],
  ] as const)("then for not using the %s the Tell asks for, with its tip, before the detail and the spelling", (technique, tip) => {
    const answer = saying({ technique: "no", shows: "no", grammar: "no" });
    expect(decide(allIn({ technique, checklist: answer, writingTip: "spelling" }))).toEqual({
      step: "send-back",
      tip,
      check: "technique",
    });
  });

  it("doesn't count a model's technique 'no' when the code found it, or when the Tell asks for none of its own", () => {
    const noTechnique = saying({ technique: "no" });
    expect(decide(allIn({ technique: "simile", techniqueFound: true, checklist: noTechnique }))).toEqual({
      step: "approve",
      tip: "great",
    });
    expect(decide(allIn({ technique: "senses", checklist: noTechnique }))).toEqual({ step: "approve", tip: "great" });
    expect(decide(allIn({ checklist: noTechnique }))).toEqual({ step: "approve", tip: "great" });
  });

  it("then for telling instead of showing, with the model's detail tip, before the spelling", () => {
    expect(decide(allIn({ checklist: saying({ shows: "no", detail: "smell" }), writingTip: "spelling" }))).toEqual({
      step: "send-back",
      tip: "smell",
      check: "shows",
    });
  });
});

describe("step 5: the second model checks after three send-backs for the same thing", () => {
  const offTopic = saying({ onTopic: "no" });

  it("sends it back as usual until then", () => {
    expect(decide(allIn({ checklist: offTopic, sentBackFor: { onTopic: RECHECK_AFTER - 1 } }))).toEqual({
      step: "send-back",
      tip: "onTopic",
      check: "onTopic",
    });
    // Send-backs for another check don't count
    expect(decide(allIn({ checklist: offTopic, sentBackFor: { shows: RECHECK_AFTER } }))).toEqual({
      step: "send-back",
      tip: "onTopic",
      check: "onTopic",
    });
  });

  it("then asks the second model before sending it back for that again", () => {
    expect(decide(allIn({ checklist: offTopic, sentBackFor: { onTopic: RECHECK_AFTER } }))).toEqual({
      step: "ask-recheck",
    });
  });

  it("skips the check when the second model says it passes, and goes on", () => {
    const facts = { checklist: offTopic, sentBackFor: { onTopic: RECHECK_AFTER }, recheck: GOOD };
    expect(decide(allIn(facts))).toEqual({ step: "approve", tip: "great" });
    expect(decide(allIn({ ...facts, writingTip: "spelling" }))).toEqual({ step: "send-back", tip: "spelling" });
  });

  it("sends it back again when the second model agrees: two models say the child missed it", () => {
    expect(
      decide(allIn({ checklist: offTopic, sentBackFor: { onTopic: RECHECK_AFTER + 2 }, recheck: saying({ onTopic: "no" }) }))
    ).toEqual({ step: "send-back", tip: "onTopic", check: "onTopic" });
  });
});

describe("step 6: clean up, once the idea is right", () => {
  it("sends it back with the writing checks' tip: a mistake never reaches the gallery", () => {
    expect(decide(allIn({ writingTip: "spelling" }))).toEqual({ step: "send-back", tip: "spelling" });
    expect(decide(allIn({ writingTip: "checkWriting" }))).toEqual({ step: "send-back", tip: "checkWriting" });
  });

  it("sends it back for grammar, and joins grammar and spelling into one tip", () => {
    expect(decide(allIn({ checklist: saying({ grammar: "no" }) }))).toEqual({ step: "send-back", tip: "readAloud" });
    expect(decide(allIn({ checklist: saying({ grammar: "no" }), writingTip: "spelling" }))).toEqual({
      step: "send-back",
      tip: "checkWriting",
    });
  });
});

describe("when something is down", () => {
  it("leaves a version a teacher took back to the teacher", () => {
    expect(decide(allIn({ undone: true }))).toEqual({ step: "teacher", because: "undone" });
  });

  it("asks the local models again for any answer that hasn't come in", () => {
    expect(decide(allIn({ safety: undefined }))).toEqual({ step: "ask-local", question: "welfare" });
    expect(decide(allIn({ welfare: { first: "no" } }))).toEqual({ step: "ask-local", question: "welfare" });
    expect(decide(allIn({ suitable: { second: "yes" } }))).toEqual({ step: "ask-local", question: "welfare" });
    expect(decide(allIn({ checklist: undefined }))).toEqual({ step: "ask-local", question: "welfare" });
  });

  it.each(READERS)("sends it to a teacher after the %s reader fails on these words again and again", (reader) => {
    expect(decide(allIn({ failedTries: { [reader]: MAX_FAILED_TRIES - 1 } }))).toEqual({ step: "approve", tip: "great" });
    expect(decide(allIn({ safety: undefined, failedTries: { [reader]: MAX_FAILED_TRIES } }))).toEqual({
      step: "teacher",
      because: "model-failed",
    });
  });

  it("never approves or sends back while any local answer is missing", () => {
    // Every way each of the six local answers can be missing, with every
    // other answer the most favorable it can be
    const parts = [
      (f: Facts) => ({ ...f, safety: undefined }),
      (f: Facts) => ({ ...f, welfare: { ...f.welfare, first: undefined } }),
      (f: Facts) => ({ ...f, welfare: { ...f.welfare, second: undefined } }),
      (f: Facts) => ({ ...f, suitable: { ...f.suitable, first: undefined } }),
      (f: Facts) => ({ ...f, suitable: { ...f.suitable, second: undefined } }),
      (f: Facts) => ({ ...f, checklist: undefined }),
    ];
    for (let mask = 1; mask < 1 << parts.length; mask++) {
      for (const writingTip of [null, "spelling"] as const) {
        for (const rules of [PASS, hold("unkind"), hold("personal-details"), hold("worrying", "sensitive-words")]) {
          let facts = allIn({ rules, writingTip, hosted: hosted("no") });
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
