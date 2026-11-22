// Step 2 of the weekly sense word job (.github/workflows/sense-words.yml).
// Step 1 (backend/scripts/sense-word-counts.ts) wrote the words from
// approved sentences to a JSON file; this asks two different free Workers
// AI models about the ones the list doesn't know, adds the words both agree
// on to src/senseWordsAdded.ts (see trusted() for which form), removes any
// word now in NEVER_ADD, and keeps only words the sense tests still pass
// with.
//
//   npx tsx scripts/sense-words.ts <counts.json> <report.md> [--dry-run]
//
// Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN. Only single words are
// sent, never a sentence. --dry-run asks and reports, but changes no file.
// Writes "changed=true|false" and "added=N" to GITHUB_OUTPUT for the
// workflow. Stops cleanly, changing nothing, when the day's free Neurons
// run out; fails when most answers can't be read (a model changed), so the
// workflow raises its alert.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ADDED_SENSE_WORDS } from "../src/senseWordsAdded";
import {
  ANSWER_AS_JSON,
  ASK_SENSE_AND_KIND,
  ASK_TEACHER,
  MODELS,
  NEURON_BUDGET,
  PER_REQUEST,
  SENSE_AND_KIND_SCHEMA,
  TEACHER_SCHEMA,
  type Answer,
  type Trusted,
  type WordCount,
  addedFile,
  chunks,
  isOutOfNeurons,
  neurons,
  newWords,
  readAnswers,
  report,
  trusted,
  withWords,
  wordsMessage,
  wordsToAsk,
} from "./senseWordJob";

const ADDED_FILE = "src/senseWordsAdded.ts";
const SENSE_TESTS = ["src/senses.test.ts", "src/senseFamilies.test.ts", "src/senseScore.test.ts"];
// Below this share of readable answers, a model has changed: fail and alert
const READABLE_AT_LEAST = 0.9;

const [countsFile, reportFile] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_AI_TOKEN;
if (!countsFile || !reportFile || !accountId || !token) {
  console.error("Can't run: needs the counts file, a report file, CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.");
  process.exit(1);
}

class OutOfNeurons extends Error {}
let spent = 0;

async function ask(model: (typeof MODELS)[keyof typeof MODELS], system: string, schema: object, words: readonly string[]) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId!)}/ai/run/${model.name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: model.jsonSchema ? system : system + ANSWER_AS_JSON },
        { role: "user", content: wordsMessage(words) },
      ],
      ...(model.jsonSchema ? { response_format: { type: "json_schema", json_schema: schema } } : {}),
      temperature: 0,
      max_tokens: 40 * words.length,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: { response?: unknown; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    errors?: unknown;
  } | null;
  if (isOutOfNeurons(body)) throw new OutOfNeurons();
  if (!response.ok || !body?.success) {
    throw new Error(`Workers AI (${model.name}) answered ${response.status}: ${JSON.stringify(body?.errors ?? null)}`);
  }
  spent += neurons(model, body.result?.usage);
  return readAnswers(body.result?.response, words);
}

const testsPass = () => {
  try {
    execFileSync("npx", ["vitest", "run", ...SENSE_TESTS], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const output = (lines: string) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
};
const finish = (markdown: string, changed: boolean, added: number) => {
  writeFileSync(reportFile, markdown);
  console.log(markdown);
  output(`changed=${changed}\nadded=${added}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
};

const header = readFileSync(ADDED_FILE, "utf8").split("export const ADDED_SENSE_WORDS")[0];
const write = (words: readonly Trusted[]) => writeFileSync(ADDED_FILE, addedFile(header, withWords(ADDED_SENSE_WORDS, words)));
const database = process.env.DATABASE_LABEL || "the database";

const counts = JSON.parse(readFileSync(countsFile, "utf8")) as WordCount[];
const toAsk = wordsToAsk(counts);
console.log(`${counts.length} words counted; asking about ${toAsk.length}.`);

// Ask, a batch at a time, until the words or the run's Neurons run out
const senseAndKind = new Map<string, Answer>();
const teacher = new Map<string, Answer>();
let asked = 0;
try {
  for (const chunk of chunks(toAsk.map(({ word }) => word), PER_REQUEST)) {
    if (spent >= NEURON_BUDGET) break;
    for (const [word, answer] of await ask(MODELS.first, ASK_SENSE_AND_KIND, SENSE_AND_KIND_SCHEMA, chunk)) senseAndKind.set(word, answer);
    for (const [word, answer] of await ask(MODELS.second, ASK_TEACHER, TEACHER_SCHEMA, chunk)) teacher.set(word, answer);
    asked += chunk.length;
  }
} catch (error) {
  if (!(error instanceof OutOfNeurons)) throw error;
  finish("Out of today's free Workers AI Neurons, so nothing changed this week. It tries again next week.", false, 0);
  process.exit(0);
}
console.log(`Asked about ${asked} words, for about ${Math.round(spent)} Neurons.`);

const readable = Math.min(senseAndKind.size, teacher.size) / Math.max(asked, 1);
if (asked > 0 && readable < READABLE_AT_LEAST) {
  console.error(`Only ${Math.round(readable * 100)}% of the answers could be read: has a model changed? Nothing was changed.`);
  process.exit(1);
}

const agreed = trusted(toAsk, senseAndKind, teacher);
console.log(`Both models agreed on ${agreed.length}: ${agreed.map(({ word, sense }) => `${word} (${sense})`).join(", ") || "none"}.`);

// Words already added that are now blocked come out, whatever else happens
const removed = newWords(withWords(ADDED_SENSE_WORDS, []), ADDED_SENSE_WORDS).map((entry) => entry.split(":")[1]);

if (dryRun) {
  finish(`Dry run: no file was changed, and the sense tests were not run.\n\n${report(agreed, [], removed, asked, database)}`, false, 0);
  process.exit(0);
}

// Keep the words the tests pass with: all at once if they can, otherwise
// one at a time
let kept: Trusted[];
const dropped: Trusted[] = [];
write(agreed);
if (testsPass()) {
  kept = agreed;
} else {
  kept = [];
  for (const word of agreed) {
    write([...kept, word]);
    if (testsPass()) kept.push(word);
    else dropped.push(word);
  }
  write(kept);
}

// Only the words that went in (at most MAX_NEW_WORDS a run)
const wentIn = new Set(newWords(ADDED_SENSE_WORDS, withWords(ADDED_SENSE_WORDS, kept)));
// (once each: "wailed" and "wail" can both add "wail", the most used counts)
const seen = new Set<string>();
const added = [...kept]
  .sort((a, b) => b.sentences - a.sentences)
  .filter(({ word, sense }) => wentIn.has(`${sense}:${word}`) && !seen.has(`${sense}:${word}`) && seen.add(`${sense}:${word}`));
finish(report(added, dropped, removed, asked, database), added.length > 0 || removed.length > 0, added.length);
