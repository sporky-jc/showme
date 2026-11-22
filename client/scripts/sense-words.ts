// Step 2 of the weekly sense word job (.github/workflows/sense-words.yml).
// Step 1 (backend/scripts/sense-word-counts.ts) wrote the words from
// approved sentences to a JSON file; this asks the free Cloudflare Workers
// AI about the ones the list doesn't know, twice in different ways, adds
// the words both answers agree on to src/senseWordsAdded.ts, and keeps only
// those the sense tests still pass with.
//
//   npx tsx scripts/sense-words.ts <counts.json> <report.md> [--dry-run]
//
// Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN. Only single words are
// sent, never a sentence. --dry-run asks and reports, but changes no file.
// Prints "added=N" to GITHUB_OUTPUT for the workflow.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ADDED_SENSE_WORDS } from "../src/senseWordsAdded";
import {
  ASK_SENSE_AND_KIND,
  ASK_TEACHER,
  PER_REQUEST,
  SENSE_AND_KIND_SCHEMA,
  TEACHER_SCHEMA,
  type Answer,
  type Trusted,
  type WordCount,
  addedFile,
  chunks,
  readAnswers,
  report,
  trusted,
  withWords,
  wordsMessage,
  wordsToAsk,
} from "./senseWordJob";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const ADDED_FILE = "src/senseWordsAdded.ts";
const SENSE_TESTS = ["src/senses.test.ts", "src/senseFamilies.test.ts", "src/senseScore.test.ts"];

const [countsFile, reportFile] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_AI_TOKEN;
if (!countsFile || !reportFile || !accountId || !token) {
  console.error("Can't run: needs the counts file, a report file, CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.");
  process.exit(1);
}

async function ask(system: string, schema: object, words: readonly string[]): Promise<Map<string, Answer>> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId!)}/ai/run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: wordsMessage(words) },
      ],
      response_format: { type: "json_schema", json_schema: schema },
      temperature: 0,
      max_tokens: 30 * words.length,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await response.json().catch(() => null)) as { success?: boolean; result?: { response?: unknown }; errors?: unknown } | null;
  if (!response.ok || !body?.success) {
    throw new Error(`Workers AI answered ${response.status}: ${JSON.stringify(body?.errors ?? null)}`);
  }
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

const header = readFileSync(ADDED_FILE, "utf8").split("export const ADDED_SENSE_WORDS")[0];
const write = (words: readonly Trusted[]) => writeFileSync(ADDED_FILE, addedFile(header, withWords(ADDED_SENSE_WORDS, words)));

const counts = JSON.parse(readFileSync(countsFile, "utf8")) as WordCount[];
const toAsk = wordsToAsk(counts);
console.log(`${counts.length} words counted; asking about ${toAsk.length}.`);

const senseAndKind = new Map<string, Answer>();
const teacher = new Map<string, Answer>();
for (const chunk of chunks(toAsk.map(({ word }) => word), PER_REQUEST)) {
  for (const [word, answer] of await ask(ASK_SENSE_AND_KIND, SENSE_AND_KIND_SCHEMA, chunk)) senseAndKind.set(word, answer);
  for (const [word, answer] of await ask(ASK_TEACHER, TEACHER_SCHEMA, chunk)) teacher.set(word, answer);
}
const agreed = trusted(toAsk, senseAndKind, teacher);
console.log(`Both answers agreed on a sense for ${agreed.length}: ${agreed.map(({ word, sense }) => `${word} (${sense})`).join(", ") || "none"}.`);

let kept: Trusted[] = [];
const dropped: Trusted[] = [];
if (!dryRun && agreed.length > 0) {
  write(agreed);
  if (testsPass()) {
    kept = agreed;
  } else {
    // One at a time, keeping each word the tests still pass with
    for (const word of agreed) {
      write([...kept, word]);
      if (testsPass()) kept.push(word);
      else dropped.push(word);
    }
    write(kept);
  }
} else {
  kept = agreed;
}

const database = process.env.DATABASE_LABEL || "the database";
const markdown = (dryRun ? "Dry run: no file was changed, and the sense tests were not run.\n\n" : "") + report(kept, dropped, toAsk.length, database);
writeFileSync(reportFile, markdown);
console.log(markdown);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `added=${dryRun ? 0 : kept.length}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
