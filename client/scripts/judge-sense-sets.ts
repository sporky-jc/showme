// Runs the judge panel (scripts/judgeSenseSets.ts, Stage A7 of
// tasks/sense-words-plan.md) on one practice set and writes its may senses
// to src/test/senseMay.ts, keeping the other set's, frozen from then on.
// One set a run: the three judges think before answering, about 67 Neurons
// a sentence, so both sets at once (about 9,200) wouldn't fit a day's free
// 10,000. The "Judge the sense
// practice sets" workflow runs it from the Actions tab. Made-up sentences
// only, never real students' writing.
//
//   npx tsx scripts/judge-sense-sets.ts --set=tuning|held-out [--try]
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
import { SENSE_MAY } from "../src/test/senseMay";
import {
  JUDGES,
  JUDGE_INSTRUCTIONS,
  type Judge,
  answerText,
  judgeMessage,
  mayFile,
  mergeMay,
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
const SETS = { tuning: SENSE_SET, "held-out": SENSE_HELD_OUT } as const;
const setName = process.argv.find((arg) => arg.startsWith("--set="))?.slice("--set=".length) as keyof typeof SETS | undefined;
if (!setName || !(setName in SETS)) {
  console.error("Can't run: say which set, --set=tuning or --set=held-out.");
  process.exit(1);
}

let neurons = 0;
const fail = (message: string): never => {
  console.error(`${message} Nothing was written.`);
  process.exit(1);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Unreadable answers printed so far (the first few, to see why)
let shownUnreadable = 0;

async function ask(judge: Judge, show: string, must: readonly SenseKey[], asked: readonly SenseKey[], attempt = 1): Promise<Map<SenseKey, boolean> | null> {
  const response = await fetch(runUrl(accountId!, judge.name), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: JUDGE_INSTRUCTIONS },
        { role: "user", content: judgeMessage(show, must, asked) },
      ],
      temperature: 0,
      // Room for a model that thinks before it answers; more on a second try
      max_tokens: attempt === 1 ? 2_000 : 4_000,
      ...(judge.noThinking ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: { usage?: { prompt_tokens?: number; completion_tokens?: number } } & Record<string, unknown>;
  } | null;
  // Cloudflare's own words too: its free Neurons seem to run over a rolling
  // 24 hours, not from 00:00 UTC (2026-11-24: refused with 3,670 used that
  // day, but over 12,000 in the last 24 hours)
  if (isOutOfNeurons(body)) {
    fail(`Out of the free Neurons (Cloudflare: ${errorDetail(body) ?? "no reason given"}): run it again once the last 24 hours' use is under 10,000.`);
  }
  // Busy for now (a 429 that isn't out of Neurons, or a server error): once more
  if (attempt === 1 && (response.status === 429 || response.status >= 500)) {
    await wait(10_000);
    return ask(judge, show, must, asked, 2);
  }
  if (!response.ok || !body?.success) {
    fail(`${judge.name} answered ${response.status}: ${errorDetail(body) ?? "no reason given"}.`);
  }
  const usage = body!.result?.usage;
  neurons += ((usage?.prompt_tokens ?? 0) * judge.input + (usage?.completion_tokens ?? 0) * judge.output) / 1_000_000;
  if (trying) console.log(`--- ${judge.name}, raw result:\n${JSON.stringify(body!.result).slice(0, 1_500)}`);
  const verdicts = readVerdicts(answerText(body!.result), asked);
  if (verdicts) return verdicts;
  // Unreadable (cut off, or not JSON): say why, the first few times, then
  // ask once more with more room
  if (shownUnreadable < 3) {
    shownUnreadable += 1;
    console.log(`Unreadable answer from ${judge.name} (try ${attempt}):\n${JSON.stringify(body!.result).slice(-800)}`);
  }
  return attempt === 1 ? ask(judge, show, must, asked, 2) : null;
}

const sentences = SETS[setName].slice(0, trying ? 3 : undefined);
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
  `## Sense practice set judged: ${setName}, ${sentences.length} sentences`,
  "",
  ...JUDGES.map(({ name }, i) => `- **${name}:** ${readable[i]} of ${sentences.length} answers readable.`),
  `- **Judgment calls (unanimous):** in ${Object.values(ordered).filter((senses) => senses.length).length} of the ${sentences.length} sentences.`,
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
// The other set's frozen answers stay as they are
const all = [...SENSE_SET, ...SENSE_HELD_OUT].map(({ show }) => show);
const file = mayFile(mergeMay(all, SENSE_MAY, ordered), new Date().toISOString().slice(0, 10));
writeFileSync(MAY_FILE, file);
console.log(`\nWrote ${MAY_FILE}:\n\n${file}`);
