// Asks one local model every question about the made-up set
// (reviewer/eval/decideSet.ts) and saves its answers to a file, for the
// decider to be scored on (tasks/scribbles-worker-spec.md, T4 and T5).
// Made-up sentences only; it never reads the database.
//
// Run by the "Score the decider" workflow, or by hand with a model server
// running (Ollama):
//
//   LOCAL_AI_URL=http://localhost:11434 LOCAL_MODEL=gemma4:e4b READER=first \
//     ANSWERS_FILE=answers-first.json node lib/scripts/collect-answers.js
//
// READER is "safety" (asked safe or unsafe) or a voter, "first" or
// "second" (asked the welfare question and for a verdict).
import { appendFileSync, writeFileSync } from "node:fs";
import { READERS, type Reader } from "../reviewer/decide.js";
import { collectAnswers, summaryOf, type Asker } from "../reviewer/eval/collect.js";
import { DECIDE_SET } from "../reviewer/eval/decideSet.js";
import { localReviewer, localSafety, localWelfare } from "../reviewer/providers/local.js";

const { LOCAL_AI_URL: url, LOCAL_MODEL: model, READER: reader, ANSWERS_FILE: file } = process.env;
if (!url || !model || !file || !(READERS as readonly string[]).includes(reader ?? "")) {
  console.error(`Set LOCAL_AI_URL, LOCAL_MODEL, ANSWERS_FILE, and READER to one of: ${READERS.join(", ")}.`);
  process.exit(1);
}

// The model's exact version, so answers from two versions are never mixed
const tags = (await (await fetch(`${url.replace(/\/+$/, "")}/api/tags`)).json()) as {
  models?: { name: string; digest: string }[];
};
const digest = tags.models?.find((m) => m.name === model || m.name === `${model}:latest`)?.digest ?? "unknown";

const settings = { url, model };
const asker: Asker =
  (reader as Reader) === "safety"
    ? { safety: (input, signal) => localSafety(settings).check(input, signal) }
    : {
        welfare: (input, signal, question) => localWelfare(settings).check(input, signal, question),
        verdict: (input, signal) => localReviewer(settings).review(input, signal),
      };

let lastShown = 0;
const collected = await collectAnswers(DECIDE_SET, asker, {
  onProgress: (done, total) => {
    // A line every 25 answers, so a long run shows it's moving
    if (done - lastShown >= 25 || done === total) {
      lastShown = done;
      console.log(`${done} of ${total} answers`);
    }
  },
});

writeFileSync(file, JSON.stringify({ reader, model, digest, set: DECIDE_SET.length, answers: collected }, null, 1));
const summary = summaryOf(`${model} (${reader})`, collected);
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
