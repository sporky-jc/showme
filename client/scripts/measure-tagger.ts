// Measures the sense tagger (backend/tagger/, Stage A4 of
// tasks/sense-words-plan.md) on the made-up labeled set: the "Measure the
// sense tagger" workflow runs it from the Actions tab. Never real students'
// writing. Uses about 1,750 of Cloudflare's 10,000 free daily Neurons.
//
//   npx tsx scripts/measure-tagger.ts
//
// Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN. Writes its report to
// the workflow's summary (and prints it).
import { appendFileSync } from "node:fs";
import { TAG_MODELS, tagShow } from "../../backend/tagger/tagger";
import { agreedTags } from "../../backend/tagger/senseTags";
import { ProviderError } from "../../backend/reviewer/providers/http";
import type { SenseTag } from "../src/senses";
import { senseWords } from "../src/senses";
import { SENSE_SET } from "../src/test/senseSet";
import { score } from "../src/test/senseScoring";
import { type Agreement, addAgreement, agreement, eitherTags, gallery, report, tagsOnly } from "./measureTagger";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_AI_TOKEN;
if (!accountId || !token) {
  console.error("Can't run: needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.");
  process.exit(1);
}

const tagsFor = new Map<string, readonly SenseTag[]>();
// Each model's own words (in the sentence, not blocked), and how many it named
const modelTags = TAG_MODELS.map(() => new Map<string, readonly SenseTag[]>());
const modelNamed = TAG_MODELS.map(() => 0);
let agreed: Agreement = { agreed: 0, differentSense: 0, onlyOne: 0 };
let unreadable = 0;
let neurons = 0;
for (const { show } of SENSE_SET) {
  try {
    const result = await tagShow(show, { accountId, token }, AbortSignal.timeout(60_000));
    tagsFor.set(show, result.tags);
    neurons += result.neurons;
    agreed = addAgreement(agreed, agreement(result.answers[0], result.answers[1]));
    result.answers.forEach((answer, i) => {
      // agreedTags of a model with itself: its own words, less the blocked ones
      const own = agreedTags(show, answer, answer);
      modelTags[i].set(show, own);
      modelNamed[i] += own.length;
    });
  } catch (error) {
    // Workers AI turned it away (out of Neurons, a busy model, a token
    // without permission): say exactly what Cloudflare said
    if (error instanceof ProviderError && error.status !== undefined) {
      console.error(`Workers AI said no (${error.message}): ${error.detail ?? "no reason given"}.`);
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
  models: TAG_MODELS.map((model, i) => ({
    name: model.name.split("/").pop() ?? model.name,
    named: modelNamed[i],
    score: score(SENSE_SET, tagsOnly(modelTags[i])),
  })),
  either: score(
    SENSE_SET,
    tagsOnly(new Map(SENSE_SET.map(({ show }) => [show, eitherTags(modelTags[0].get(show) ?? [], modelTags[1].get(show) ?? [])])))
  ),
  agreed,
  unreadable,
  neurons,
});
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
