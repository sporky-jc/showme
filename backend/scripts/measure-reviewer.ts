// Measures the AI reviewer on made-up sentences (reviewer/samples.ts): how
// often it agrees with a teacher, how often the safety check holds what it
// should, and how long it takes. Uses the real providers, so it needs their
// keys; it never reads the database, so no real student's sentence is sent.
//
// Run from GitHub: Actions → "Measure the AI reviewer" → Run workflow (or
// "Measure small open models", which sets LOCAL_AI_URL: see below). Or
// locally with the keys in .env.local: npm run measure:reviewer
import { appendFileSync } from "node:fs";
import { reviewSentence } from "../reviewer/reviewer.js";
import { reviewerSetup, type ReviewerSetup } from "../reviewer/settings.js";
import { localReviewer, localSafety, localWelfare } from "../reviewer/providers/local.js";
import { SAMPLES } from "../reviewer/samples.js";
import { outcomeOf, scoreOf, type Outcome, type Score } from "../reviewer/measure.js";

// Small open models on a machine of our own instead (providers/local.ts),
// when LOCAL_AI_URL is set: the "Measure small open models" workflow. Only
// this script can ask them; the live reviewer's settings never do.
const { LOCAL_AI_URL: url, LOCAL_REVIEW_MODEL: model, LOCAL_SAFETY_MODEL: safetyModel } = process.env;
if (url && (!model || !safetyModel)) {
  console.error("With LOCAL_AI_URL, set LOCAL_REVIEW_MODEL and LOCAL_SAFETY_MODEL too.");
  process.exit(1);
}
const setup: ReviewerSetup =
  url && model && safetyModel
    ? {
        mode: "suggest",
        safety: localSafety({ url, model: safetyModel }),
        welfare: localWelfare({ url, model }),
        providers: [localReviewer({ url, model })],
      }
    : reviewerSetup({ ...process.env, REVIEWER_MODE: "suggest" });
if (!setup.safety || !setup.welfare || setup.providers.length === 0) {
  console.error("No safety check or AI provider is set up: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.");
  process.exit(1);
}
// A model on a few shared cores is slow: it gets two minutes an answer, not
// the live reviewer's ten seconds
const timeoutMs = url ? 120_000 : undefined;

const rows: {
  expected: string;
  got: Outcome;
  score: Score;
  reasons: string[];
  ms: number;
  by: string;
  show: string;
  note: string;
}[] = [];

for (const sample of SAMPLES) {
  const started = Date.now();
  const { suggestion } = await reviewSentence(sample, setup.providers, { safety: setup.safety, welfare: setup.welfare, timeoutMs });
  const ms = Date.now() - started;
  const got = outcomeOf(suggestion);
  const score = scoreOf(sample, suggestion);
  const note = [
    suggestion.tip ?? "",
    got === "held by rules" ? `held: ${suggestion.reasons.join(", ")}` : "",
    score === "wrong-reason" ? `should be ${sample.reason === "worrying" ? "worrying" : "a hold other than worrying"}` : "",
    suggestion.misspelled?.length ? `misspelled: ${suggestion.misspelled.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  rows.push({ expected: sample.expected, got, score, reasons: suggestion.reasons, ms, by: suggestion.decidedBy, show: sample.show, note });
}

const count = (test: (r: (typeof rows)[number]) => boolean) => rows.filter(test).length;
const wrongApprovals = count((r) => r.got === "approve" && r.expected !== "approve");
// Sentences a teacher would send back that the rules held instead, by reason
const heldByReason = new Map<string, number>();
for (const row of rows.filter((r) => r.score === "held")) {
  for (const reason of row.reasons) heldByReason.set(reason, (heldByReason.get(reason) ?? 0) + 1);
}
const MARK: Record<Score, string> = { agreed: "✅", held: "🟡", "wrong-reason": "🟠", wrong: "❌" };
const lines = [
  "## AI reviewer measurement",
  "",
  `Providers: ${setup.providers.map((p) => p.name).join(", ")}; safety check: ${setup.safety.name}; welfare check: ${setup.welfare.name}`,
  "",
  `- Agreed with the teacher (or left it for them): **${count((r) => r.score === "agreed")} of ${rows.length}**`,
  `- Approved something a teacher wouldn't: **${wrongApprovals}** (must be 0 before any automatic step)`,
  `- Unsafe sentences held: **${count((r) => r.expected === "unsafe" && r.score !== "wrong")} of ${count((r) => r.expected === "unsafe")}**; held as the wrong kind (worrying or not): ${count((r) => r.score === "wrong-reason")}`,
  `- Good sentences held by the rules (false holds): ${count((r) => r.expected === "approve" && r.got === "held by rules")}`,
  `- Sentences to send back that the rules held instead: ${count((r) => r.score === "held")}${
    heldByReason.size > 0 ? ` (${[...heldByReason].map(([reason, n]) => `${reason}: ${n}`).join(", ")})` : ""
  }`,
  `- Left for the teacher ("unsure"): ${count((r) => r.got === "unsure")}; no answer (failed or out of free requests): ${count((r) => r.got === "no answer")}`,
  `- Slowest: ${Math.max(...rows.map((r) => r.ms))} ms; average ${Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length)} ms`,
  "",
  "✅ agreed, 🟡 held by the rules instead of sent back, 🟠 held as the wrong kind, ❌ wrong",
  "",
  "| | Expected | Got | Tip, spelling | ms | Sentence |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${MARK[r.score]} | ${r.expected} | ${r.got} | ${r.note} | ${r.ms} | ${r.show.replace(/\|/g, "/")} |`),
];
const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
