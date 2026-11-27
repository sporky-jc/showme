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
const GOOD: ChecklistAnswer = {
  suitable: "yes",
  onTopic: "yes",
  technique: "yes",
  shows: "yes",
  detail: "see",
  grammar: "yes",
};
const saying = (more: Partial<ChecklistAnswer>): ChecklistAnswer => ({ ...GOOD, ...more });

// Every local reader answered: no worry, and both checklists say it's fine
// for the gallery and well written
const allIn = (more: Partial<Facts> = {}): Facts => ({
  rules: PASS,
  writingTip: null,
  safety: "safe",
  welfare: { first: "no", second: "no" },
  checklist: GOOD,
  second: GOOD,
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
    // ... even with rude words only, or bad writing
    expect(decide(allIn({ rules: hold("unkind"), welfare: { first: "yes", second: "yes" } }))).toEqual({
      step: "teacher",
      because: "worry",
    });
    expect(
      decide(allIn({ checklist: saying({ onTopic: "no" }), writingTip: "spelling", welfare: { first: "yes", second: "yes" } }))
    ).toEqual({ step: "teacher", because: "worry" });
  });

  describe("both worried and both say it's unkind about someone: sent back to fix it, and a teacher told", () => {
    const both = { welfare: { first: "yes" as const, second: "yes" as const } };
    const unkind = saying({ suitable: "unkind" });
    it("both models' checklists say unkind (the second asked only then)", () => {
      const { second: _, ...noSecond } = allIn({ ...both, checklist: unkind });
      expect(decide(noSecond)).toEqual({ step: "ask-second" });
      expect(decide(allIn({ ...both, checklist: unkind, second: unkind }))).toEqual({
        step: "send-back",
        tip: "kindWords",
        teacher: "worry",
      });
    });
    it("one model's unkind alone is a teacher only: threats and self-harm got it too", () => {
      expect(decide(allIn({ ...both, checklist: unkind, second: saying({ suitable: "unsure" }) }))).toEqual({
        step: "teacher",
        because: "worry",
      });
      expect(decide(allIn({ ...both, second: unkind }))).toEqual({ step: "teacher", because: "worry" });
    });
    it("a teacher only when the safety model also worried; the hosted model asked with personal details", () => {
      expect(decide(allIn({ ...both, safety: "unsafe", checklist: unkind, second: unkind }))).toEqual({
        step: "teacher",
        because: "worry",
      });
      // With personal details, the hosted model is asked instead
      expect(decide(allIn({ ...both, rules: hold("personal-details"), checklist: unkind, second: unkind }))).toEqual({
        step: "ask-hosted",
        question: "welfare",
        about: "worry",
      });
    });
    it("but not when it's only not for the gallery, or the rules found a worrying phrase: a teacher only", () => {
      expect(decide(allIn({ ...both, checklist: saying({ suitable: "unsure" }), second: saying({ suitable: "unsure" }) }))).toEqual({
        step: "teacher",
        because: "worry",
      });
      // "The big kids kick me and call me a weirdo": not told to be kind
      expect(decide(allIn({ ...both, rules: hold("worrying", "sensitive-words"), checklist: unkind, second: unkind }))).toEqual({
        step: "teacher",
        because: "worry",
      });
    });
  });

  it("sends back an unkind sentence with no worry like any other not for the gallery", () => {
    expect(decide(allIn({ checklist: saying({ suitable: "unkind" }) }))).toEqual({ step: "send-back", tip: "kindWords" });
    expect(decide(allIn({ second: saying({ suitable: "unkind" }) }))).toEqual({ step: "send-back", tip: "kindWords" });
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
  });

  it("asks the hosted model when both local models worry about a sentence with personal details", () => {
    const personal = hold("personal-details");
    const both = { rules: personal, welfare: { first: "yes" as const, second: "yes" as const } };
    expect(decide(allIn(both))).toEqual({ step: "ask-hosted", question: "welfare", about: "worry" });
    // A worry ("home alone, I'm only 7"): a teacher
    expect(decide(allIn({ ...both, hosted: hosted("yes") }))).toEqual({ step: "teacher", because: "worry" });
    // None ("my snapchat is ... add me"): sent back to take them out
    expect(decide(allIn({ ...both, hosted: hosted("no") }))).toEqual({ step: "send-back", tip: "privateDetails" });
    // The hosted model didn't answer in 6 hours: a teacher
    expect(decide(allIn({ ...both, worryWaitedMs: WORRY_WAIT_MS }))).toEqual({ step: "teacher", because: "worry-not-checked" });
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
  it("sends it back with the kind-words tip when the first model is unsure, before anything about the writing", () => {
    const unsure = saying({ suitable: "unsure", onTopic: "no", grammar: "no" });
    expect(decide(allIn({ checklist: unsure, writingTip: "spelling" }))).toEqual({ step: "send-back", tip: "kindWords" });
  });
});

describe("step 5: revise, first problem first", () => {
  it("sends it back for being off topic first, whatever else is wrong", () => {
    const everything = saying({ onTopic: "no", technique: "no", shows: "no", grammar: "no" });
    expect(decide(allIn({ technique: "simile", checklist: everything, second: everything, writingTip: "spelling" }))).toEqual({
      step: "send-back",
      tip: "onTopic",
      check: "onTopic",
    });
  });

  it("asks the second model when off topic comes with 'doesn't show': a sentence that only says the Tell again gets a detail tip", () => {
    const telling = saying({ onTopic: "no", shows: "no", detail: "showNotTell" });
    const { second: _, ...noSecond } = allIn({ checklist: telling });
    expect(decide(noSecond)).toEqual({ step: "ask-second" });
    // "Our lunch was gross and yucky and bad.": the second says on topic
    expect(decide(allIn({ checklist: telling }))).toEqual({ step: "send-back", tip: "showNotTell", check: "shows" });
    // Both say off topic
    expect(decide(allIn({ checklist: telling, second: telling }))).toEqual({ step: "send-back", tip: "onTopic", check: "onTopic" });
    // Off topic but it shows: no second model needed
    const { second: __, ...alone } = allIn({ checklist: saying({ onTopic: "no" }) });
    expect(decide(alone)).toEqual({ step: "send-back", tip: "onTopic", check: "onTopic" });
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

describe("the second model, when the first says no after three send-backs for the same thing", () => {
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
    expect(decide(allIn({ checklist: offTopic, second: undefined, sentBackFor: { onTopic: RECHECK_AFTER } }))).toEqual({
      step: "ask-second",
    });
  });

  it("skips the check when the second model says it passes, and goes on", () => {
    const facts = { checklist: offTopic, sentBackFor: { onTopic: RECHECK_AFTER }, second: GOOD };
    expect(decide(allIn(facts))).toEqual({ step: "approve", tip: "great" });
    expect(decide(allIn({ ...facts, writingTip: "spelling" }))).toEqual({ step: "send-back", tip: "spelling" });
  });

  it("sends it back again when the second model agrees: two models say the child missed it", () => {
    expect(
      decide(allIn({ checklist: offTopic, sentBackFor: { onTopic: RECHECK_AFTER + 2 }, second: saying({ onTopic: "no" }) }))
    ).toEqual({ step: "send-back", tip: "onTopic", check: "onTopic" });
  });

  it("does the same for grammar", () => {
    const grammar = saying({ grammar: "no" });
    expect(decide(allIn({ checklist: grammar, sentBackFor: { grammar: RECHECK_AFTER }, second: GOOD }))).toEqual({
      step: "approve",
      tip: "great",
    });
  });
});

describe("step 7: an approval needs the second model's checklist too", () => {
  it("asks for it only once the first model's checklist and the writing checks have nothing to send back", () => {
    expect(decide(allIn({ second: undefined }))).toEqual({ step: "ask-second" });
    // Not for a sentence going back anyway
    expect(decide(allIn({ second: undefined, checklist: saying({ shows: "no", detail: "hear" }) }))).toEqual({
      step: "send-back",
      tip: "hear",
      check: "shows",
    });
    expect(decide(allIn({ second: undefined, writingTip: "spelling" }))).toEqual({ step: "send-back", tip: "spelling" });
  });

  it("sends it back with the kind-words tip when the second model is unsure about the gallery", () => {
    expect(decide(allIn({ second: saying({ suitable: "unsure" }) }))).toEqual({ step: "send-back", tip: "kindWords" });
  });

  it("sends it back when the second model finds a grammar mistake, with the grammar tip", () => {
    expect(decide(allIn({ second: saying({ grammar: "no" }) }))).toEqual({
      step: "send-back",
      tip: "readAloud",
      check: "grammar",
    });
  });

  it.each([
    ["off topic", { onTopic: "no" as const }],
    ["no detail", { shows: "no" as const, detail: "smell" as const }],
    ["no technique", { technique: "no" as const }],
  ])("leaves the writing to the first model: the second's '%s' doesn't stop an approval", (_name, more) => {
    expect(decide(allIn({ technique: "metaphor", second: saying(more) }))).toEqual({ step: "approve", tip: "great" });
  });

  it("lets a check pass after three send-backs for it, when only the second model keeps saying no: no loop", () => {
    expect(decide(allIn({ second: saying({ grammar: "no" }), sentBackFor: { grammar: RECHECK_AFTER } }))).toEqual({
      step: "approve",
      tip: "great",
    });
    // ... but never the gallery question
    expect(decide(allIn({ second: saying({ suitable: "unsure" }), sentBackFor: { grammar: RECHECK_AFTER } }))).toEqual({
      step: "send-back",
      tip: "kindWords",
    });
  });
});

describe("step 6: clean up, once the idea is right", () => {
  it("sends it back with the writing checks' tip: a mistake never reaches the gallery", () => {
    expect(decide(allIn({ writingTip: "spelling" }))).toEqual({ step: "send-back", tip: "spelling" });
    expect(decide(allIn({ writingTip: "checkWriting" }))).toEqual({ step: "send-back", tip: "checkWriting" });
  });

  it("sends it back for grammar, and joins grammar and spelling into one tip", () => {
    expect(decide(allIn({ checklist: saying({ grammar: "no" }) }))).toEqual({
      step: "send-back",
      tip: "readAloud",
      check: "grammar",
    });
    expect(decide(allIn({ checklist: saying({ grammar: "no" }), writingTip: "spelling" }))).toEqual({
      step: "send-back",
      tip: "checkWriting",
      check: "grammar",
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
    // Every way each of the four answers asked of every sentence can be
    // missing, with every other answer the most favorable it can be
    const parts = [
      (f: Facts) => ({ ...f, safety: undefined }),
      (f: Facts) => ({ ...f, welfare: { ...f.welfare, first: undefined } }),
      (f: Facts) => ({ ...f, welfare: { ...f.welfare, second: undefined } }),
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

  it("never approves without the second model's checklist", () => {
    for (const rules of [PASS, hold("worrying", "sensitive-words")]) {
      expect(decide(allIn({ rules, second: undefined, hosted: hosted("no") }))).toEqual({ step: "ask-second" });
    }
  });

  it("names its readers and voters in one place", () => {
    expect(READERS).toEqual(["safety", ...VOTERS]);
  });
});
