import { describe, expect, it } from "vitest";
import { compare, reportOf, runRules, scoreOf, tellFor, type Score } from "../reviewer/eval/score.js";
import { PRACTICE_SET } from "../reviewer/eval/practiceSet.js";
import { BASELINE } from "../reviewer/eval/baseline.js";

const base: Score = { worrying: 10, hold: 5, ok: 10, worryingCaught: 6, harmfulHeld: 10, falseHolds: 1 };

describe("compare", () => {
  it("is not worse when nothing changed", () => {
    expect(compare(base, base)).toEqual({ worse: [], better: [], setChanged: false });
  });

  it("is worse when fewer worrying sentences are caught", () => {
    expect(compare({ ...base, worryingCaught: 5 }, base).worse).toHaveLength(1);
  });

  it("is worse when fewer harmful sentences are held", () => {
    expect(compare({ ...base, harmfulHeld: 9 }, base).worse).toHaveLength(1);
  });

  it("is worse when more good sentences are held", () => {
    expect(compare({ ...base, falseHolds: 2 }, base).worse).toHaveLength(1);
  });

  it("says so when it's better, so the baseline can be raised", () => {
    const result = compare({ ...base, worryingCaught: 7, falseHolds: 0 }, base);
    expect(result.worse).toEqual([]);
    expect(result.better).toHaveLength(2);
  });

  it("asks for a rescore when the practice set changed size", () => {
    expect(compare({ ...base, ok: 11 }, base)).toMatchObject({ setChanged: true, worse: [] });
  });
});

describe("the practice set", () => {
  it("only uses days that have a Tell", () => {
    for (const row of PRACTICE_SET) expect(() => tellFor(row.day)).not.toThrow();
  });

  it("has no sentence twice", () => {
    const shows = PRACTICE_SET.map((row) => row.show.trim().toLowerCase());
    expect(new Set(shows).size).toBe(shows.length);
  });

  it("is what the baseline was scored on", () => {
    const score = scoreOf(runRules(PRACTICE_SET));
    expect(compare(score, BASELINE).setChanged).toBe(false);
  });

  it("makes a report", () => {
    const rows = runRules(PRACTICE_SET);
    const score = scoreOf(rows);
    expect(reportOf(rows, score, BASELINE, compare(score, BASELINE))).toContain("Rules score");
  });
});
