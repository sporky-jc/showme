import { describe, expect, it } from "vitest";
import { DECIDE_SET, EXPECTS } from "../reviewer/eval/decideSet.js";
import { checkRules } from "../reviewer/rules.js";
import { CLEAN_UP_TIPS, TECHNIQUE_TIP, TIP_IDS } from "../reviewer/tips.js";

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

  it("keeps the first 497 rows where they were: saved answers name a row by its place", () => {
    expect(DECIDE_SET[496].show).toBe("His heart thumped like a drum as the hallway light flickered out.");
    expect(DECIDE_SET.slice(0, 497).some((row) => row.kind.startsWith("order:"))).toBe(false);
  });

  it("says which tips are right for every order row sent back, revise tips and clean-up tips both", () => {
    const order = DECIDE_SET.filter((row) => row.kind.startsWith("order:"));
    expect(order.length).toBeGreaterThanOrEqual(40);
    for (const row of order) {
      expect(row.tips !== undefined, row.show).toBe(row.expect === "send-back");
      for (const tip of row.tips ?? []) expect(TIP_IDS).toContain(tip);
    }
    const tips = order.flatMap((row) => row.tips ?? []);
    expect(tips).toContain("onTopic");
    for (const technique of ["metaphor", "personification", "hyperbole", "allusion"] as const) {
      expect(tips).toContain(TECHNIQUE_TIP[technique]);
    }
    expect(tips.some((tip) => CLEAN_UP_TIPS.has(tip))).toBe(true);
    // Each off-topic row has a slip too, or is clean, but its tip is never a clean-up one
    for (const row of order.filter((r) => r.kind === "order:off-topic")) expect(row.tips).toEqual(["onTopic"]);
  });

  it("has plenty of sentences to approve and to send back", () => {
    expect(count((row) => row.expect === "approve")).toBeGreaterThanOrEqual(20);
    expect(count((row) => row.expect === "send-back")).toBeGreaterThanOrEqual(60);
    expect(DECIDE_SET.length).toBeGreaterThanOrEqual(400);
  });
});
