// Scores the rule checks on the practice set (reviewer/eval/score.ts) and
// fails if they do worse than the baseline (reviewer/eval/baseline.ts). CI
// runs it on every pull request, in "Backend tests". No AI, no database.
//
//   npm run score:rules                 score, and compare with the baseline
//   npm run score:rules -- --update     also write the new score as the
//                                       baseline (commit it with the change)
import { appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRACTICE_SET } from "../reviewer/eval/practiceSet.js";
import { BASELINE } from "../reviewer/eval/baseline.js";
import { compare, reportOf, runRules, scoreOf } from "../reviewer/eval/score.js";

const rows = runRules(PRACTICE_SET);
const score = scoreOf(rows);
const comparison = compare(score, BASELINE);
const report = reportOf(rows, score, BASELINE, comparison);
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);

if (process.argv.includes("--update")) {
  // The source file, not the built copy in lib/
  const file = fileURLToPath(new URL("../../reviewer/eval/baseline.ts", import.meta.url));
  writeFileSync(
    file,
    [
      "// The last accepted rules score on the practice set (score.ts). CI fails a",
      "// pull request that scores worse. Written by `npm run score:rules -- --update`:",
      "// raise it whenever the rules get better, and rescore it whenever the",
      "// practice set changes.",
      'import type { Score } from "./score.js";',
      "",
      `export const BASELINE: Score = ${JSON.stringify(score, null, 2).replace(/"(\w+)":/g, "$1:")};`,
      "",
    ].join("\n")
  );
  console.log(`\nBaseline written to ${file}.`);
} else if (comparison.setChanged || comparison.worse.length > 0) {
  process.exitCode = 1;
}
