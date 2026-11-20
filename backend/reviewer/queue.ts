// Reviews the sentences waiting for the teacher, a few at a time, and saves
// a suggestion for each (models/reviewSuggestions.ts). Run every few minutes
// by the scheduled function in index.ts. In "suggest" mode it changes
// nothing a student or the gallery sees: the teacher still decides.
//
// Which sentences: waiting (not approved, not sent back), written or edited
// in the last 30 days, whose words aren't the ones a suggestion was last
// saved for (the sentence's `reviewedShow`), oldest first. That is one
// query, so however many held sentences wait for a teacher, a new one is
// still found.
//
// A student who sends the same words again (after "Try again", or an edit
// that changes nothing) keeps the suggestion already saved for those words:
// `reviewedShow` still matches, so the sentence isn't reviewed again and the
// queue never loops on it. That's right for "suggest" mode, where the
// teacher reads the suggestion; an automatic mode will go by the sentence's
// state (approved, sent back), not by this.
import { logger } from "firebase-functions/logger";
import type { Types } from "mongoose";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { reviewSentence, type ProviderAttempt } from "./reviewer.js";
import type { ReviewerSetup } from "./settings.js";
import { messageOf } from "../utils/errors.js";

// At most this many sentences per run, so one run stays well inside the free
// requests and the time a scheduled function may take
export const SENTENCES_PER_RUN = 10;

// No new review is started this long after the run began: the scheduled
// function may run for 300 seconds (index.ts), and one review can take up to
// two provider time limits
export const RUN_DEADLINE_MS = 240_000;

// Sentences waiting longer than this aren't reviewed: a teacher has long
// since seen them without a suggestion
export const MAX_AGE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

// Why a run stopped early: a provider is out of free requests (HTTP 429) or
// its key is refused (401, 403), so every other request would fail too; or
// the run's time is up
export type StoppedBecause = "rate-limited" | "credentials" | "deadline";

type Waiting = {
  _id: Types.ObjectId;
  tell: string;
  show: string;
  safetyInvalidShow?: string;
  failedShow?: string;
  failedCount?: number;
};

// The outcomes that mean nobody could decide only because a request didn't
// get through: tried again on a later run rather than saved for good. (Not
// "refused", any other HTTP 4xx: the API took the request and will refuse
// it again, so the hold is saved at once.)
const NOT_THROUGH = new Set<ProviderAttempt["outcome"]>(["failed", "timeout", "rate-limited", "credentials", "safe"]);
const BLOCKED = new Set<ProviderAttempt["outcome"]>(["rate-limited", "credentials"]);

// A review of the same words that fails or times out this many runs in a
// row is saved as a hold ("no-safety-check" or "no-provider"), so a person
// sees it: a sentence that fails the same way every time (an input the
// API can't take, say) never waits for ever, nor blocks newer ones
export const MAX_FAILED_RUNS = 3;

export const reviewWaitingSentences = async (
  setup: ReviewerSetup,
  {
    limit = SENTENCES_PER_RUN,
    timeoutMs,
    only = {},
    deadlineMs = RUN_DEADLINE_MS,
    now = Date.now,
  }: {
    limit?: number;
    timeoutMs?: number;
    // Only the waiting sentences that also match this (scripts/seed-dev.ts
    // reviews just its sample sentences)
    only?: { _id?: { $in: Types.ObjectId[] } };
    // How long after the start no new review is begun
    deadlineMs?: number;
    // The clock (a test can set its own)
    now?: () => number;
  } = {}
): Promise<{ reviewed: number; stopped?: StoppedBecause }> => {
  if (setup.mode === "off") return { reviewed: 0 };
  // Not set up yet: review nothing, so every sentence is reviewed once it is
  if (setup.providers.length === 0 || !setup.safety) {
    logger.warn("Reviewer is on but has no safety check or no AI provider set up");
    return { reviewed: 0 };
  }

  const started = now();
  const since = new Date(started - MAX_AGE_DAYS * DAY);
  // Each sentence is looked at once per run, even if it's left to try again
  const seen: Types.ObjectId[] = [];
  let asked = 0;
  let count = 0;
  let stopped: StoppedBecause | undefined;

  run: while (asked < limit) {
    const batch = await Sentence.find(
      {
        $and: [only, { _id: { $nin: seen } }],
        approved: false,
        toRedo: false,
        createdAt: { $gte: since },
        // No suggestion yet for these exact words
        $expr: { $ne: ["$reviewedShow", "$show"] },
      },
      { tell: 1, show: 1, safetyInvalidShow: 1, failedShow: 1, failedCount: 1 }
    )
      // Never tried first (oldest first), then the ones whose last try failed,
      // longest ago first: those wait behind everything new
      .sort({ lastTriedAt: 1, createdAt: 1 })
      .limit(limit - asked)
      .lean<Waiting[]>();
    if (batch.length === 0) break;

    for (const sentence of batch) {
      seen.push(sentence._id);
      if (now() - started >= deadlineMs) {
        stopped = "deadline";
        break run;
      }
      const id = String(sentence._id);
      try {
        // A suggestion already saved for these words (from before sentences
        // kept `reviewedShow`): note it, with no request to anyone
        if (await ReviewSuggestion.exists({ sentence: sentence._id, show: sentence.show })) {
          await markReviewed(sentence);
          continue;
        }

        asked++;
        const { suggestion, attempts } = await reviewSentence(
          { tell: sentence.tell, show: sentence.show },
          setup.providers,
          { safety: setup.safety, timeoutMs }
        );
        // Only ids and outcomes are logged, never a student's words
        logger.info("Reviewer suggestion", {
          sentence: id,
          verdict: suggestion.verdict,
          reasons: suggestion.reasons,
          decidedBy: suggestion.decidedBy,
          attempts,
        });

        if (await worthSaving(sentence, suggestion.decidedBy, attempts, now)) {
          await ReviewSuggestion.updateOne(
            { sentence: sentence._id, show: sentence.show },
            {
              $setOnInsert: {
                ...suggestion,
                attempts,
                sentence: sentence._id,
                show: sentence.show,
                createdAt: new Date(),
              },
            },
            { upsert: true }
          );
          await markReviewed(sentence);
          count++;
        }

        // Out of free requests, or the key is refused: every other request
        // this run would fail the same way, so stop here. Only when the
        // safety check was (nothing gets past it), or every provider asked
        // was: one blocked provider with a later one answering is fine.
        const safetyAttempt = attempts.find((a) => a.provider === setup.safety?.name);
        const providerAttempts = attempts.filter((a) => a !== safetyAttempt);
        const blocked =
          safetyAttempt && BLOCKED.has(safetyAttempt.outcome)
            ? safetyAttempt
            : providerAttempts.length > 0 && providerAttempts.every((a) => BLOCKED.has(a.outcome))
              ? providerAttempts[providerAttempts.length - 1]
              : undefined;
        if (blocked) {
          stopped = blocked.outcome as StoppedBecause;
          // A refused key needs a person to fix it: ERROR, to alert on. (write()
          // rather than error(), which would add a stack trace of this line.)
          logger.write({
            severity: blocked.outcome === "credentials" ? "ERROR" : "WARNING",
            message: `Reviewer stopped this run: ${blocked.provider} answered ${
              blocked.outcome === "rate-limited" ? "HTTP 429 (out of free requests)" : "HTTP 401/403 (check its key)"
            }`,
            sentence: id,
            provider: blocked.provider,
            outcome: blocked.outcome,
          });
          break run;
        }
      } catch (error) {
        logger.warn(`Reviewer could not review a sentence: ${messageOf(error)}`, { sentence: id });
      }
    }
  }
  if (stopped === "deadline") logger.warn("Reviewer stopped this run: out of time", { reviewed: count });
  return stopped ? { reviewed: count, stopped } : { reviewed: count };
};

// Whether to save this suggestion, or leave the sentence to try again on a
// later run. Nobody could decide only because a request didn't get through
// (down, too slow, out of free requests until tomorrow, a refused key): try
// again. The safety check answered, but not in its form: try again once,
// and save the hold ("no-safety-check") if it does the same for the same
// words a second time, so a sentence can't be retried forever. A review
// that failed or timed out MAX_FAILED_RUNS runs in a row for the same words
// is saved too. (Out of free requests or a refused key isn't the sentence's
// fault: those are tried again however often, and stop the run anyway.)
const worthSaving = async (
  sentence: Waiting,
  decidedBy: string,
  attempts: ProviderAttempt[],
  now: () => number
) => {
  if (decidedBy !== "none") return true;
  const where = { _id: sentence._id, show: sentence.show };
  const lastTriedAt = new Date(now());
  if (attempts.length > 0 && attempts.every((a) => NOT_THROUGH.has(a.outcome))) {
    if (attempts.some((a) => BLOCKED.has(a.outcome))) {
      await Sentence.updateOne(where, { $set: { lastTriedAt } });
      return false;
    }
    const failedCount = (sentence.failedShow === sentence.show ? (sentence.failedCount ?? 0) : 0) + 1;
    if (failedCount >= MAX_FAILED_RUNS) return true;
    await Sentence.updateOne(where, { $set: { failedShow: sentence.show, failedCount, lastTriedAt } });
    return false;
  }
  const safetyInvalid = attempts.length === 1 && attempts[0].outcome === "invalid";
  if (safetyInvalid && sentence.safetyInvalidShow !== sentence.show) {
    await Sentence.updateOne(where, { $set: { safetyInvalidShow: sentence.show, lastTriedAt } });
    return false;
  }
  return true;
};

// The sentence's current words have a suggestion. Only if they're still its
// words: a student's edit since then is reviewed on its own.
const markReviewed = (sentence: Waiting) =>
  Sentence.updateOne(
    { _id: sentence._id, show: sentence.show },
    { $set: { reviewedShow: sentence.show, reviewedAt: new Date() } }
  );
