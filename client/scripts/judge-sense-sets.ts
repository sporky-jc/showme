// Runs the judge panel (scripts/judgeSenseSets.ts, Stage A7 of
// tasks/sense-words-plan.md) on both practice sets and writes the may
// senses to src/test/senseMay.ts, frozen from then on. The "Judge the sense
// practice sets" workflow runs it from the Actions tab. Made-up sentences
// only, never real students' writing.
//
//   npx tsx scripts/judge-sense-sets.ts [--try]
//
// --try: only the first 3 sentences, printing each judge's raw answer, to
// check the models answer as expected; writes nothing. Needs
// CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN. Fails, writing nothing, if
// a judge's answers mostly can't be read or the free Neurons run out: a
// half-judged answer key would be worse than none.
import { appendFileSync, writeFileSync } from "node:fs";
import { errorDetail, isOutOfNeurons, runUrl } from "../../backend/reviewer/providers/cloudflare";
import type { SenseKey } from "../src/senses";
import { SENSE_SET } from "../src/test/senseSet";
import { SENSE_HELD_OUT } from "../src/test/senseHeldOut";
import {
  JUDGES,
  JUDGE_INSTRUCTIONS,
  type Judge,
  answerText,
  judgeMessage,
  mayFile,
  readVerdicts,
  sensesToAsk,
  unanimous,
} from "./judgeSenseSets";

const MAY_FILE = "src/test/senseMay.ts";
// Below this share of readable answers from any judge, stop: fix the reading
const READABLE_AT_LEAST = 0.9;
// Stop well before the day's 10,000 free Neurons
const NEURON_BUDGET = 9_000;

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_AI_TOKEN;
if (!accountId || !token) {
  console.error("Can't run: needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.");
  process.exit(1);
}
const trying = process.argv.includes("--try");

let neurons = 0;
const fail = (message: string): never => {
  console.error(`${message} Nothing was written.`);
  process.exit(1);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ask(judge: Judge, show: string, must: readonly SenseKey[], asked: readonly SenseKey[], retried = false) {
  const response = await fetch(runUrl(accountId!, judge.name), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: JUDGE_INSTRUCTIONS },
        { role: "user", content: judgeMessage(show, must, asked) },
      ],
      temperature: 0,
      // Room for a model that thinks before it answers
      max_tokens: 1_500,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: { usage?: { prompt_tokens?: number; completion_tokens?: number } } & Record<string, unknown>;
  } | null;
  if (isOutOfNeurons(body)) fail("Out of today's free Neurons: run it again after 00:00 UTC.");
  // Busy for now (a 429 that isn't out of Neurons, or a server error): once more
  if (!retried && (response.status === 429 || response.status >= 500)) {
    await wait(10_000);
    return ask(judge, show, must, asked, true);
  }
  if (!response.ok || !body?.success) {
    fail(`${judge.name} answered ${response.status}: ${errorDetail(body) ?? "no reason given"}.`);
  }
  const usage = body!.result?.usage;
  neurons += ((usage?.prompt_tokens ?? 0) * judge.input + (usage?.completion_tokens ?? 0) * judge.output) / 1_000_000;
  if (trying) console.log(`--- ${judge.name}, raw result:\n${JSON.stringify(body!.result).slice(0, 1_500)}`);
  return readVerdicts(answerText(body!.result), asked);
}

const sentences = [...SENSE_SET, ...SENSE_HELD_OUT].slice(0, trying ? 3 : undefined);
const may: Record<string, SenseKey[]> = {};
const readable = JUDGES.map(() => 0);

// One sentence: all three judges at once (some think for half a minute first)
async function judge({ show, senses }: (typeof sentences)[number]) {
  const asked = sensesToAsk(senses);
  const verdicts = await Promise.all(JUDGES.map((judge) => ask(judge, show, senses, asked)));
  verdicts.forEach((verdict, i) => {
    if (verdict) readable[i] += 1;
  });
  may[show] = unanimous(asked, verdicts);
  if (trying) console.log(`=> ${show}\n   may: ${may[show].join(", ") || "none"}`);
}

// A few sentences at a time, well inside Workers AI's request limits
const AT_ONCE = 4;
for (let i = 0; i < sentences.length; i += AT_ONCE) {
  if (neurons > NEURON_BUDGET) fail(`Stopped at about ${Math.round(neurons)} Neurons, near the free daily 10,000.`);
  await Promise.all(sentences.slice(i, i + AT_ONCE).map(judge));
}
// In the sets' order, whatever order the answers came in
const ordered = Object.fromEntries(sentences.map(({ show }) => [show, may[show] ?? []]));

const lines = [
  `## Sense practice sets judged: ${sentences.length} sentences`,
  "",
  ...JUDGES.map(({ name }, i) => `- **${name}:** ${readable[i]} of ${sentences.length} answers readable.`),
  `- **Judgment calls (unanimous):** ${Object.values(ordered).filter((senses) => senses.length).length} sentences.`,
  `- **Neurons used:** about ${Math.round(neurons)}.`,
  "",
  ...Object.entries(ordered)
    .filter(([, senses]) => senses.length)
    .map(([show, senses]) => `- ${senses.join(", ")}: ${show}`),
];
const summary = lines.join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

if (trying) process.exit(0);
const worst = Math.min(...readable) / sentences.length;
if (worst < READABLE_AT_LEAST) fail(`A judge's answers could be read only ${Math.round(worst * 100)}% of the time.`);
const file = mayFile(ordered, new Date().toISOString().slice(0, 10));
writeFileSync(MAY_FILE, file);
console.log(`\nWrote ${MAY_FILE}:\n\n${file}`);
