// Runs the sense tagger (tagger.ts) on approved sentences that don't have
// highlights for their current words yet, a few each run, newest first.
// Run every 10 minutes by the scheduled function in index.ts, whether or not
// Scribbles is on. Stage A of tasks/sense-words-plan.md.
//
// Stays free: at most TAGS_PER_RUN sentences a run, and it stops for the day
// at its Neuron budget (TAGGER_NEURONS_PER_DAY, set per backend at deploy:
// staging and production share the sense account's 10,000 free daily
// Neurons with the weekly measure), with TAGS_PER_DAY sentences as a
// backstop. It stops for the run as soon as Cloudflare says the day's
// Neurons have run out. Test accounts' sentences (QA Wolf's) are
// never tagged, so their constant approvals use no Neurons.
import mongoose from "mongoose";
import { Sentence } from "../models/sentences.js";
import { TEST_SENTENCES } from "../config/testAccounts.js";
import { isModelGone } from "../reviewer/providers/cloudflare.js";
import { ProviderError } from "../reviewer/providers/http.js";
import { addTaggerNeurons, taggerNeuronsToday } from "../models/taggerUsage.js";
import { tagShow, type TaggerSettings } from "./tagger.js";
import type { SenseTag } from "./senseTags.js";

export const TAGS_PER_RUN = 5;
export const TAGS_PER_DAY = 150;
// A model that hasn't answered by then is given up on for this run
export const REQUEST_TIMEOUT_MS = 20_000;
// No new sentence is started this long after the run began. The scheduled
// function may run for 300 seconds, and Scribbles runs after the tagger with
// what's left (index.ts), so the tagger keeps its share small: at most 45
// seconds, plus one sentence's two requests (2 x 20 seconds).
export const RUN_DEADLINE_MS = 45_000;
// Failures in a row with the same words before the tagger gives up on them
export const MAX_TAG_FAILURES = 3;

// The day's Neuron budget: TAGGER_NEURONS_PER_DAY when it's a whole number,
// otherwise 4,000 (a sentence costs about 33)
export const DEFAULT_NEURONS_PER_DAY = 4_000;
export const neuronBudget = (env: Record<string, string | undefined> = process.env) => {
  const value = env.TAGGER_NEURONS_PER_DAY;
  return value && /^\d{1,6}$/.test(value) ? Number(value) : DEFAULT_NEURONS_PER_DAY;
};

// "rate-limited": Workers AI turned requests away for now (HTTP 429), such as
// today's free Neurons running out or a busy model; "model-gone": one of the
// two models is retired or unknown (tagger.ts's TAG_MODELS needs changing);
// "neuron-budget": the day's budget is spent. `detail` says what Cloudflare
// said.
export type TagStop = "rate-limited" | "credentials" | "model-gone" | "neuron-budget" | "daily-limit" | "deadline";

type Tag = (show: string, settings: TaggerSettings, signal: AbortSignal) => Promise<{ tags: SenseTag[]; neurons: number }>;

export const startOfToday = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export async function tagApprovedSentences(
  settings: TaggerSettings,
  {
    tag = tagShow,
    now = () => new Date(),
    limit = TAGS_PER_RUN,
    perDay = TAGS_PER_DAY,
    neuronsPerDay = neuronBudget(),
    deadlineMs = RUN_DEADLINE_MS,
  } = {} as {
    tag?: Tag;
    now?: () => Date;
    limit?: number;
    perDay?: number;
    neuronsPerDay?: number;
    deadlineMs?: number;
  }
): Promise<{ tagged: number; unreadable: number; gaveUp: number; neurons: number; stopped?: TagStop; detail?: string }> {
  const started = now().getTime();
  const taggedToday = await Sentence.countDocuments({ taggedAt: { $gte: startOfToday(now()) } });
  const room = Math.min(limit, perDay - taggedToday);
  if (room <= 0) return { tagged: 0, unreadable: 0, gaveUp: 0, neurons: 0, stopped: "daily-limit" };
  const spentBefore = await taggerNeuronsToday(now());
  if (spentBefore >= neuronsPerDay) return { tagged: 0, unreadable: 0, gaveUp: 0, neurons: 0, stopped: "neuron-budget" };

  // Approved, not a test account's, and no highlights for these exact words
  const waiting = await Sentence.find(
    {
      approved: true,
      GID: { $not: TEST_SENTENCES },
      $expr: { $ne: ["$taggedShow", "$show"] },
    },
    { _id: 1, show: 1, tagFailures: 1, tagFailedShow: 1 }
  )
    .sort({ decidedAt: -1, createdAt: -1 })
    .limit(room)
    .lean<{ _id: mongoose.Types.ObjectId; show: string; tagFailures?: number; tagFailedShow?: string }[]>();

  let tagged = 0;
  let unreadable = 0;
  let gaveUp = 0;
  let neurons = 0;
  for (const sentence of waiting) {
    if (now().getTime() - started > deadlineMs) return { tagged, unreadable, gaveUp, neurons, stopped: "deadline" };
    if (spentBefore + neurons >= neuronsPerDay) return { tagged, unreadable, gaveUp, neurons, stopped: "neuron-budget" };
    let tags: SenseTag[];
    try {
      const result = await tag(sentence.show, settings, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
      tags = result.tags;
      neurons += result.neurons;
      await addTaggerNeurons(now(), result.neurons);
    } catch (error) {
      // What the failed sentence spent still counts towards the day's budget
      const spent = (error as { neuronsSpent?: unknown } | null)?.neuronsSpent;
      if (typeof spent === "number" && spent > 0) {
        neurons += spent;
        await addTaggerNeurons(now(), spent);
      }
      if (error instanceof ProviderError && error.status === 429) {
        return { tagged, unreadable, gaveUp, neurons, stopped: "rate-limited", detail: error.detail };
      }
      if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) {
        return { tagged, unreadable, gaveUp, neurons, stopped: "credentials", detail: error.detail };
      }
      if (error instanceof ProviderError && isModelGone(error.status, error.detail)) {
        return { tagged, unreadable, gaveUp, neurons, stopped: "model-gone", detail: error.detail };
      }
      // A model answered in a form that can't be read: saved with no AI
      // highlights (the word list still lights what it knows), so the same
      // sentence doesn't use Neurons every run
      if (error instanceof ProviderError && error.invalid) {
        tags = [];
        unreadable += 1;
      } else {
        // Anything else (a timeout, a network error) is tried again next
        // run, up to MAX_TAG_FAILURES times with the same words; then it's
        // saved with no AI highlights too
        const failures = (sentence.tagFailedShow === sentence.show ? (sentence.tagFailures ?? 0) : 0) + 1;
        if (failures < MAX_TAG_FAILURES) {
          await Sentence.updateOne(
            { _id: sentence._id, show: { $eq: sentence.show } },
            { $set: { tagFailures: failures, tagFailedShow: sentence.show } }
          );
          continue;
        }
        tags = [];
        gaveUp += 1;
      }
    }
    // Only if the words are still the ones tagged: an edit in the meantime
    // wins, and is tagged once it's approved again
    const { modifiedCount } = await Sentence.updateOne(
      { _id: sentence._id, approved: true, show: { $eq: sentence.show } },
      { $set: { senseTags: tags, taggedShow: sentence.show, taggedAt: now() } }
    );
    if (modifiedCount === 1) tagged += 1;
  }
  return { tagged, unreadable, gaveUp, neurons };
}
