// Measures the sense tagger (backend/tagger/, Stage A4 of
// tasks/sense-words-plan.md) on the made-up labeled set: the "Measure the
// sense tagger" workflow runs it from the Actions tab. Never real students'
// writing. Uses about 3,000 of Cloudflare's 10,000 free daily Neurons.
//
//   npx tsx scripts/measure-tagger.ts
//
// Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN. Writes its report to
// the workflow's summary (and prints it).
import { appendFileSync } from "node:fs";
import { tagShow } from "../../backend/tagger/tagger";
import { ProviderError } from "../../backend/reviewer/providers/http";
import type { SenseTag } from "../src/senses";
import { senseWords } from "../src/senses";
import { SENSE_SET } from "../src/test/senseSet";
import { score } from "../src/test/senseScoring";
import { type Agreement, addAgreement, agreement, gallery, report, tagsOnly } from "./measureTagger";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_AI_TOKEN;
if (!accountId || !token) {
  console.error("Can't run: needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.");
  process.exit(1);
}

const tagsFor = new Map<string, readonly SenseTag[]>();
let agreed: Agreement = { agreed: 0, differentSense: 0, onlyOne: 0 };
let unreadable = 0;
let neurons = 0;
for (const { show } of SENSE_SET) {
  try {
    const result = await tagShow(show, { accountId, token }, AbortSignal.timeout(60_000));
    tagsFor.set(show, result.tags);
    neurons += result.neurons;
    agreed = addAgreement(agreed, agreement(result.answers[0], result.answers[1]));
  } catch (error) {
    if (error instanceof ProviderError && error.status === 429) {
      console.error("Out of today's free Neurons: try again after 00:00 UTC.");
      process.exit(1);
    }
    if (error instanceof ProviderError && error.invalid) {
      unreadable += 1;
      tagsFor.set(show, []);
      continue;
    }
    throw error;
  }
}

const markdown = report({
  sentences: SENSE_SET.length,
  list: score(SENSE_SET, (show) => senseWords(show)),
  aiOnly: score(SENSE_SET, tagsOnly(tagsFor)),
  withTags: score(SENSE_SET, gallery(tagsFor)),
  agreed,
  unreadable,
  neurons,
});
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
