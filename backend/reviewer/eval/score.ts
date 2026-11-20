// The rules score: how the rule checks (reviewer/rules.ts) do on the practice
// set (practiceSet.ts), made-up sentences written by someone who didn't look
// at the rules. CI runs it on every pull request (scripts/score-rules.ts) and
// fails if a change makes the rules catch less, or hold more good sentences,
// than the last accepted score (baseline.ts).
//
// It never calls an AI, so it's free and takes seconds. It measures only the
// rules: the AI layers are measured by hand (scripts/measure-reviewer.ts),
// because each sentence uses some of the free daily AI allowance.
//
// The practice set is in the code, so anyone changing the rules can see it,
// and a rule written for one practice sentence will score well here without
// being better. A score here is a floor, not proof: the real miss rate is
// measured on a separate set that is kept out of the code.
import tellList from "../../public/tellList.js";
import { checkRules, type RuleOutcome } from "../rules.js";
import type { PracticeExpected, PracticeRow } from "./practiceSet.js";

export type Score = {
  // Rows in the set, by what they should get
  worrying: number;
  hold: number;
  ok: number;
  // Worrying rows held as worrying (shown first on the Teacher page)
  worryingCaught: number;
  // Worrying or "hold" rows held for any reason (a person reads them)
  harmfulHeld: number;
  // Good rows held anyway (a teacher has to read them for nothing)
  falseHolds: number;
};

export type Row = PracticeRow & { result: RuleOutcome };

export const tellFor = (day: number) => {
  const tell = tellList.find((t) => t.key === day)?.tell;
  if (!tell) throw new Error(`The practice set uses day ${day}, which has no Tell`);
  return tell;
};

export const runRules = (rows: PracticeRow[]): Row[] =>
  rows.map((row) => ({ ...row, result: checkRules(tellFor(row.day), row.show) }));

const held = (row: Row) => row.result.outcome === "hold";
const heldAsWorrying = (row: Row) => row.result.outcome === "hold" && row.result.reasons.includes("worrying");

export const scoreOf = (rows: Row[]): Score => {
  const count = (expected: PracticeExpected, test: (row: Row) => boolean = () => true) =>
    rows.filter((row) => row.expected === expected && test(row)).length;
  return {
    worrying: count("worrying"),
    hold: count("hold"),
    ok: count("ok"),
    worryingCaught: count("worrying", heldAsWorrying),
    harmfulHeld: count("worrying", held) + count("hold", held),
    falseHolds: count("ok", held),
  };
};

export type Comparison = {
  // Why the score is worse than the baseline (empty: not worse)
  worse: string[];
  // Why the score is better (the baseline can be raised)
  better: string[];
  // The practice set changed size: the baseline must be rescored with it
  setChanged: boolean;
};

export const compare = (score: Score, baseline: Score): Comparison => {
  const setChanged = score.worrying !== baseline.worrying || score.hold !== baseline.hold || score.ok !== baseline.ok;
  if (setChanged) return { worse: [], better: [], setChanged };
  const worse: string[] = [];
  const better: string[] = [];
  const higherIsBetter = (key: "worryingCaught" | "harmfulHeld", what: string) => {
    if (score[key] < baseline[key]) worse.push(`${what}: ${score[key]}, was ${baseline[key]}`);
    if (score[key] > baseline[key]) better.push(`${what}: ${score[key]}, was ${baseline[key]}`);
  };
  higherIsBetter("worryingCaught", "Worrying sentences caught as worrying");
  higherIsBetter("harmfulHeld", "Worrying or unsuitable sentences held");
  if (score.falseHolds > baseline.falseHolds) worse.push(`Good sentences held: ${score.falseHolds}, was ${baseline.falseHolds}`);
  if (score.falseHolds < baseline.falseHolds) better.push(`Good sentences held: ${score.falseHolds}, was ${baseline.falseHolds}`);
  return { worse, better, setChanged };
};

const percent = (part: number, whole: number) => (whole === 0 ? "-" : `${Math.round((part / whole) * 100)}%`);

// The report CI shows on the run's summary page (and prints in the log)
export const reportOf = (rows: Row[], score: Score, baseline: Score, comparison: Comparison) => {
  const missed = (expected: PracticeExpected, test: (row: Row) => boolean) =>
    rows.filter((row) => row.expected === expected && test(row));
  const byCategory = new Map<string, { n: number; caught: number }>();
  for (const row of rows) {
    const key = `${row.expected} / ${row.category}`;
    const entry = byCategory.get(key) ?? { n: 0, caught: 0 };
    entry.n += 1;
    const caught = row.expected === "worrying" ? heldAsWorrying(row) : row.expected === "hold" ? held(row) : !held(row);
    if (caught) entry.caught += 1;
    byCategory.set(key, entry);
  }
  const verdict = comparison.setChanged
    ? "❌ The practice set changed: rescore the baseline (`npm run score:rules -- --update`) in the same pull request."
    : comparison.worse.length > 0
      ? `❌ Worse than the baseline:\n${comparison.worse.map((w) => `- ${w}`).join("\n")}`
      : comparison.better.length > 0
        ? `✅ Better than the baseline. Raise it so it stays this good (\`npm run score:rules -- --update\`):\n${comparison.better.map((b) => `- ${b}`).join("\n")}`
        : "✅ Same as the baseline.";
  const list = (title: string, items: Row[]) =>
    items.length === 0
      ? []
      : [
          `<details><summary>${title} (${items.length})</summary>`,
          "",
          ...items.map((row) => `- ${row.category}: ${row.show.replace(/[<>|]/g, " ")}`),
          "",
          "</details>",
          "",
        ];
  return [
    "## Rules score (practice set, no AI)",
    "",
    verdict,
    "",
    "| | Now | Baseline |",
    "|---|---|---|",
    `| Worrying caught as worrying | ${score.worryingCaught} of ${score.worrying} (${percent(score.worryingCaught, score.worrying)}) | ${baseline.worryingCaught} |`,
    `| Worrying or unsuitable held | ${score.harmfulHeld} of ${score.worrying + score.hold} (${percent(score.harmfulHeld, score.worrying + score.hold)}) | ${baseline.harmfulHeld} |`,
    `| Good sentences held | ${score.falseHolds} of ${score.ok} (${percent(score.falseHolds, score.ok)}) | ${baseline.falseHolds} |`,
    "",
    "The rules are only the first layer: the AI safety check and reviewer read what they pass.",
    "",
    "| Kind | Right |",
    "|---|---|",
    ...[...byCategory].sort(([a], [b]) => a.localeCompare(b)).map(([key, { n, caught }]) => `| ${key} | ${caught} of ${n} |`),
    "",
    ...list("Worrying, not caught as worrying", missed("worrying", (row) => !heldAsWorrying(row))),
    ...list("Unsuitable, passed", missed("hold", (row) => !held(row))),
    ...list("Good, held", missed("ok", held)),
  ].join("\n");
};
