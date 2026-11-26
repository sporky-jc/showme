import { describe, expect, it } from "vitest";
import { DECIDE_SET, EXPECTS } from "../reviewer/eval/decideSet.js";
import { checkRules } from "../reviewer/rules.js";

// The made-up set the decider is scored on (reviewer/eval/decideSet.ts):
// that it's whole, and big enough to mean something
// (tasks/scribbles-worker-spec.md, T3).

const count = (test: (row: (typeof DECIDE_SET)[number]) => boolean) => DECIDE_SET.filter(test).length;

describe("the decider's made-up set", () => {
  it("gives every sentence a Tell and something that must happen to it", () => {
    for (const row of DECIDE_SET) {
      expect(row.tell.trim(), row.show).not.toBe("");
      expect(row.show.trim()).not.toBe("");
      expect(EXPECTS).toContain(row.expect);
    }
  });

  it("has no sentence twice", () => {
    const shows = DECIDE_SET.map((row) => row.show.trim().toLowerCase());
    expect(new Set(shows).size).toBe(shows.length);
  });

  it("has at least 100 real worries, some no word list catches", () => {
    expect(count((row) => row.expect === "teacher")).toBeGreaterThanOrEqual(100);
    const quiet = DECIDE_SET.filter((row) => row.kind === "quiet-worry");
    expect(quiet.length).toBeGreaterThanOrEqual(20);
    // "Quiet": the rules don't find an explicit worrying phrase in most of
    // them, so the models have to
    const missedByRules = quiet.filter((row) => {
      const rules = checkRules(row.tell, row.show);
      return !(rules.outcome === "hold" && rules.reasons.includes("worrying"));
    });
    expect(missedByRules.length).toBeGreaterThanOrEqual(quiet.length / 2);
  });

  it("has harmless sentences that use a scary word, trick sentences, and pairs", () => {
    expect(count((row) => row.kind === "practice:tricky-innocent")).toBeGreaterThanOrEqual(30);
    expect(count((row) => row.kind === "trick")).toBeGreaterThanOrEqual(15);
    const pairs = DECIDE_SET.filter((row) => row.before !== undefined);
    expect(pairs.length).toBeGreaterThanOrEqual(10);
    for (const row of pairs) expect(row.before).not.toBe(row.show);
    // Both ways: rewordings that are still a problem, and real fixes
    expect(pairs.some((row) => row.expect === "approve")).toBe(true);
    expect(pairs.some((row) => row.expect !== "approve")).toBe(true);
  });

  it("has plenty of sentences to approve and to send back", () => {
    expect(count((row) => row.expect === "approve")).toBeGreaterThanOrEqual(20);
    expect(count((row) => row.expect === "send-back")).toBeGreaterThanOrEqual(60);
    expect(DECIDE_SET.length).toBeGreaterThanOrEqual(400);
  });
});
