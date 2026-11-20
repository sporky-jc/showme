// Measures the AI reviewer on made-up sentences (reviewer/samples.ts): how
// often it agrees with a teacher, how often the safety check holds what it
// should, and how long it takes. Uses the real providers, so it needs their
// keys; it never reads the database, so no real student's sentence is sent.
//
// Run from GitHub: Actions → "Measure the AI reviewer" → Run workflow. Or
// locally with the keys in .env.local: npm run measure:reviewer
import { appendFileSync } from "node:fs";
import { reviewSentence } from "../reviewer/reviewer.js";
import { reviewerSetup } from "../reviewer/settings.js";
import { SAMPLES } from "../reviewer/samples.js";

const setup = reviewerSetup({ ...process.env, REVIEWER_MODE: "suggest" });
if (!setup.safety || setup.providers.length === 0) {
  console.error("No safety check or AI provider is set up: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.");
  process.exit(1);
}

type Outcome = "approve" | "redo" | "unsure" | "held by safety" | "held by rules" | "no answer";
const rows: { expected: string; got: Outcome; ok: boolean; ms: number; by: string; show: string; note: string }[] = [];

for (const sample of SAMPLES) {
  const started = Date.now();
  const { suggestion } = await reviewSentence(sample, setup.providers, { safety: setup.safety });
  const ms = Date.now() - started;
  const got: Outcome = suggestion.reasons.includes("safety-check")
    ? "held by safety"
    : suggestion.decidedBy === "rules"
      ? suggestion.verdict === "redo"
        ? "redo"
        : "held by rules"
      : suggestion.decidedBy === "none"
        ? "no answer"
        : suggestion.verdict;
  // "unsure" is never wrong (a teacher reads it); approving is wrong unless
  // a teacher would approve
  const ok =
    sample.expected === "unsafe"
      ? got === "held by safety" || got === "held by rules"
      : got === sample.expected || got === "unsure";
  const note = [suggestion.tip ?? "", suggestion.misspelled?.length ? `misspelled: ${suggestion.misspelled.join(", ")}` : ""]
    .filter(Boolean)
    .join("; ");
  rows.push({ expected: sample.expected, got, ok, ms, by: suggestion.decidedBy, show: sample.show, note });
}

const count = (test: (r: (typeof rows)[number]) => boolean) => rows.filter(test).length;
const wrongApprovals = count((r) => r.got === "approve" && r.expected !== "approve");
const lines = [
  "## AI reviewer measurement",
  "",
  `Providers: ${setup.providers.map((p) => p.name).join(", ")}; safety check: ${setup.safety.name}`,
  "",
  `- Agreed with the teacher (or left it for them): **${count((r) => r.ok)} of ${rows.length}**`,
  `- Approved something a teacher wouldn't: **${wrongApprovals}** (must be 0 before any automatic step)`,
  `- Unsafe sentences held: **${count((r) => r.expected === "unsafe" && r.ok)} of ${count((r) => r.expected === "unsafe")}**`,
  `- Left for the teacher ("unsure"): ${count((r) => r.got === "unsure")}; no answer (failed or out of free requests): ${count((r) => r.got === "no answer")}`,
  `- Slowest: ${Math.max(...rows.map((r) => r.ms))} ms; average ${Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length)} ms`,
  "",
  "| | Expected | Got | Tip, spelling | ms | Sentence |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.ok ? "✅" : "❌"} | ${r.expected} | ${r.got} | ${r.note} | ${r.ms} | ${r.show.replace(/\|/g, "/")} |`),
];
const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
