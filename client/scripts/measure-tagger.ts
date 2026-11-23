// Measures the sense tagger (backend/tagger/, Stage A4 of
// tasks/sense-words-plan.md) on the made-up labeled set: the "Measure the
// sense tagger" workflow runs it from the Actions tab. Never real students'
// writing. Uses about 4,500 of Cloudflare's 10,000 free daily Neurons
// (97 tuning sentences and 40 held-out ones).
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
import { SENSE_SET, type Labeled } from "../src/test/senseSet";
import { SENSE_HELD_OUT } from "../src/test/senseHeldOut";
import { score, withMay } from "../src/test/senseScoring";
import { type Agreement, addAgreement, agreement, eitherTags, gallery, ready, report, tagsOnly } from "./measureTagger";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_AI_TOKEN;
if (!accountId || !token) {
  console.error("Can't run: needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.");
  process.exit(1);
}

// One practice set: run the tagger on each sentence, then score it
async function measure(name: string, set: readonly Labeled[]) {
  const tagsFor = new Map<string, readonly SenseTag[]>();
  // Each model's own words (in the sentence, not blocked), and how many it named
  const modelTags = TAG_MODELS.map(() => new Map<string, readonly SenseTag[]>());
  const modelNamed = TAG_MODELS.map(() => 0);
  let agreed: Agreement = { agreed: 0, differentSense: 0, onlyOne: 0 };
  let unreadable = 0;
  let neurons = 0;
  for (const { show } of set) {
    try {
      const result = await tagShow(show, { accountId: accountId!, token: token! }, AbortSignal.timeout(60_000));
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

  const list = score(set, (show) => senseWords(show));
  const withTags = score(set, gallery(tagsFor));
  return {
    passed: ready(list, withTags),
    markdown: report({
      name,
      sentences: set.length,
      list,
      aiOnly: score(set, tagsOnly(tagsFor)),
      withTags,
      models: TAG_MODELS.map((model, i) => ({
        name: model.name.split("/").pop() ?? model.name,
        named: modelNamed[i],
        score: score(set, tagsOnly(modelTags[i])),
      })),
      either: score(
        set,
        tagsOnly(new Map(set.map(({ show }) => [show, eitherTags(modelTags[0].get(show) ?? [], modelTags[1].get(show) ?? [])])))
      ),
      agreed,
      unreadable,
      neurons,
    }),
  };
}

// The set the question is tuned on, then the held-out one it never is:
// production needs both to pass
const tuning = await measure("tuning set", withMay(SENSE_SET));
const heldOut = await measure("held-out set, never tuned on", withMay(SENSE_HELD_OUT));
const markdown = [
  tuning.markdown,
  heldOut.markdown,
  tuning.passed && heldOut.passed
    ? "## Ready for production: both sets pass."
    : "## Not ready for production yet: both sets must pass.",
].join("\n\n");
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
