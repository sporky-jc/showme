// Scores the decider on the local models' saved answers to the made-up set
// (reviewer/eval/decideScore.ts, tasks/scribbles-worker-spec.md T5), and
// prints the report, with Checkpoint A's numbers. Reads only the answer
// files: no model, no database.
//
//   ANSWERS_DIR=./answers node lib/scripts/score-decider.js
//
// A slow reader's answers can come in parts (answers-second-1.json,
// answers-second-2.json); they're joined back up here.
//
// A reader whose file is missing (its job failed) counts as no answer for
// every sentence, so the report shows what's missing rather than failing.
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { READERS } from "../reviewer/decide.js";
import { formatDecideReport, reportOf, scoreDecider, type AnswerFile } from "../reviewer/eval/decideScore.js";
import { DECIDE_SET } from "../reviewer/eval/decideSet.js";

const dir = process.env.ANSWERS_DIR ?? ".";
const files: AnswerFile[] = [];
const names = existsSync(dir) ? readdirSync(dir) : [];
for (const reader of READERS) {
  const paths = names
    .filter((name) => new RegExp(`^answers-${reader}(-\\d+)?\\.json$`).test(name))
    .sort()
    .map((name) => join(dir, name));
  if (paths.length === 0) {
    console.warn(`No answers from the ${reader} reader (in ${dir})`);
    continue;
  }
  const parts = paths.map((path) => ({ path, file: JSON.parse(readFileSync(path, "utf8")) as AnswerFile }));
  for (const { path, file } of parts) {
    // Answers to another version of the set can't be matched to its rows,
    // and two models' or versions' answers are never mixed
    if (file.set !== DECIDE_SET.length) {
      console.error(`${path} is for a set of ${file.set} sentences; this one has ${DECIDE_SET.length}.`);
      process.exit(1);
    }
    if (file.reader !== reader || file.model !== parts[0].file.model || file.digest !== parts[0].file.digest) {
      console.error(`${path} isn't from the same ${reader} model as ${parts[0].path}.`);
      process.exit(1);
    }
  }
  files.push({ ...parts[0].file, answers: parts.flatMap(({ file }) => file.answers) });
}

const report = formatDecideReport(reportOf(scoreDecider(DECIDE_SET, files)), DECIDE_SET, files);
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
