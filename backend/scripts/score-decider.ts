// Scores the decider on the local models' saved answers to the made-up set
// (reviewer/eval/decideScore.ts, tasks/scribbles-worker-spec.md T5), and
// prints the report, with Checkpoint A's numbers. Reads only the answer
// files: no model, no database.
//
//   ANSWERS_DIR=./answers node lib/scripts/score-decider.js
//
// A reader whose file is missing (its job failed) counts as no answer for
// every sentence, so the report shows what's missing rather than failing.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { READERS } from "../reviewer/decide.js";
import { formatDecideReport, reportOf, scoreDecider, type AnswerFile } from "../reviewer/eval/decideScore.js";
import { DECIDE_SET } from "../reviewer/eval/decideSet.js";

const dir = process.env.ANSWERS_DIR ?? ".";
const files: AnswerFile[] = [];
for (const reader of READERS) {
  const path = join(dir, `answers-${reader}.json`);
  if (!existsSync(path)) {
    console.warn(`No answers from the ${reader} reader (${path})`);
    continue;
  }
  const file = JSON.parse(readFileSync(path, "utf8")) as AnswerFile;
  // Answers to another version of the set can't be matched to its rows
  if (file.set !== DECIDE_SET.length) {
    console.error(`${path} is for a set of ${file.set} sentences; this one has ${DECIDE_SET.length}.`);
    process.exit(1);
  }
  files.push(file);
}

const report = formatDecideReport(reportOf(scoreDecider(DECIDE_SET, files)), DECIDE_SET, files);
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
