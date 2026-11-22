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
// state (approved, sent back), not by this. A saved "Try again" for words
// sent back twice since is shown to the teacher as "unsure" all the same
// (withinSendBacks, applied again by the Teacher page's route).
import { logger } from "firebase-functions/logger";
import type { Types } from "mongoose";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { reviewSentence, type ProviderAttempt } from "./reviewer.js";
import type { ReviewerSetup } from "./settings.js";
import { messageOf } from "../utils/errors.js";
import { readReviewerSwitch } from "../models/reviewerSwitch.js";
import { TEST_SENTENCES } from "../config/testAccounts.js";

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
// its key is refused (401, 403), so every other request would fail too; a
// provider refused two sentences' requests (HTTP 400, 422...), which looks
// like our setup, not the sentences; the run's time is up; or a teacher
// paused Scribbles from the Teacher page (see pausedNow below)
export type StoppedBecause = "rate-limited" | "credentials" | "configuration" | "deadline" | "paused";

type Waiting = {
  _id: Types.ObjectId;
  tell: string;
  show: string;
  safetyInvalidShow?: string;
  failedShow?: string;
  failedCount?: number;
  redoCount?: number;
};
type Reviewed = Awaited<ReturnType<typeof reviewSentence>>;

// The outcomes that mean nobody could decide only because a request didn't
// get through: tried again on a later run rather than saved for good. (A
// check that passed the sentence, "safe" or "no-concern", decided nothing.)
const NOT_THROUGH = new Set<ProviderAttempt["outcome"]>([
  "failed",
  "timeout",
  "rate-limited",
  "credentials",
  "safe",
  "no-concern",
]);
const BLOCKED = new Set<ProviderAttempt["outcome"]>(["rate-limited", "credentials"]);
const FAILED = new Set<ProviderAttempt["outcome"]>(["failed", "timeout"]);
// A provider answered: it was up
const ANSWERED = new Set<ProviderAttempt["outcome"]>(["answered", "safe", "unsafe", "concern", "no-concern", "invalid"]);

// A review of the same words that fails or times out this many runs in a
// row is saved as a hold ("no-safety-check", "no-welfare-check", which is
// also "worrying", or "no-provider"), so a person sees it: a sentence that
// fails the same way every time (an input the API can't take, say) never
// waits for ever, nor blocks newer ones. A run only counts when the
// provider that failed it answered for another sentence in that run: an
// outage fails every sentence, and none of them is to blame.
export const MAX_FAILED_RUNS = 3;

// A provider that refuses (HTTP 400, 422...) this many sentences in one run
// is refusing our requests, not the sentences: the run stops, and none of
// those holds is saved
const REFUSALS_THAT_STOP = 2;

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
  // (without the welfare check, every one would be held as worrying)
  if (setup.providers.length === 0 || !setup.safety || !setup.welfare) {
    logger.warn("Reviewer is on but has no safety check, welfare check or AI provider set up");
    return { reviewed: 0 };
  }
  // Paused from the Teacher page: nothing this run (see pausedNow)
  if (await pausedNow()) return { reviewed: 0, stopped: "paused" };

  const started = now();
  const since = new Date(started - MAX_AGE_DAYS * DAY);
  // Each sentence is looked at once per run, even if it's left to try again
  const seen: Types.ObjectId[] = [];
  let asked = 0;
  let count = 0;
  let stopped: StoppedBecause | undefined;
  // Which sentences each provider answered for this run
  const answeredFor = new Map<string, Set<string>>();
  // Sentences left to decide at the end of the run, once it's known which
  // providers were up: failed reviews, and refused ones by provider
  const failedReviews: { sentence: Waiting; result: Reviewed }[] = [];
  const refusedBy = new Map<string, { sentence: Waiting; result: Reviewed }[]>();

  const save = async (sentence: Waiting, { suggestion, attempts }: Reviewed) => {
    await ReviewSuggestion.updateOne(
      { sentence: sentence._id, show: sentence.show },
      { $setOnInsert: { ...suggestion, attempts, sentence: sentence._id, show: sentence.show, createdAt: new Date() } },
      { upsert: true }
    );
    await markReviewed(sentence);
    count++;
  };

  run: while (asked < limit) {
    const batch = await Sentence.find(
      {
        $and: [only, { _id: { $nin: seen } }],
        approved: false,
        toRedo: false,
        createdAt: { $gte: since },
        // Not written by a staging test account (config/testAccounts.ts).
        // QA Wolf's runs write dozens of sentences a day, and reviewing them
        // used up the whole free daily AI allowance within minutes of its
        // reset, leaving none for real or sample sentences. Their tests
        // don't need Scribbles' notes; the reviewer's own tests cover it.
        GID: { $not: TEST_SENTENCES },
        // No suggestion yet for these exact words
        $expr: { $ne: ["$reviewedShow", "$show"] },
      },
      { tell: 1, show: 1, safetyInvalidShow: 1, failedShow: 1, failedCount: 1, redoCount: 1 }
    )
      // Never tried first (oldest first), then the ones whose last try failed,
      // longest ago first: those wait behind everything new. (An edit clears
      // the last try, controllers/routes.ts.)
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
      // Paused while this run was going: no more sentences go to the AI.
      // What this run has already been told is still saved below (they're
      // only suggestions: the teacher decides).
      if (await pausedNow()) {
        stopped = "paused";
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
        const result = await reviewSentence({ tell: sentence.tell, show: sentence.show }, setup.providers, {
          safety: setup.safety,
          welfare: setup.welfare,
          timeoutMs,
          // So a sentence already sent back twice isn't suggested for a
          // third time (MAX_SEND_BACKS, sendBacks.ts)
          sentBack: sentence.redoCount ?? 0,
        });
        const { suggestion, attempts } = result;
        // Only ids and outcomes are logged, never a student's words
        logger.info("Reviewer suggestion", {
          sentence: id,
          verdict: suggestion.verdict,
          reasons: suggestion.reasons,
          decidedBy: suggestion.decidedBy,
          attempts,
        });
        for (const attempt of attempts) {
          if (ANSWERED.has(attempt.outcome)) {
            answeredFor.set(attempt.provider, (answeredFor.get(attempt.provider) ?? new Set()).add(id));
          }
        }

        const lastTriedAt = new Date(now());
        const where = { _id: sentence._id, show: sentence.show };
        const refused = attempts.find((a) => a.outcome === "refused");
        // The checks asked before any reviewer: nothing gets past either
        const isCheck = (a: ProviderAttempt) => a.provider === setup.safety?.name || a.provider === setup.welfare?.name;
        if (suggestion.decidedBy !== "none") {
          await save(sentence, result);
        } else if (refused) {
          // Refused: the hold is saved at the end of the run, unless the
          // same provider refuses another sentence too
          const refusals = [...(refusedBy.get(refused.provider) ?? []), { sentence, result }];
          refusedBy.set(refused.provider, refusals);
          await Sentence.updateOne(where, { $set: { lastTriedAt } });
          if (refusals.length >= REFUSALS_THAT_STOP) {
            stopped = "configuration";
            logger.write({
              severity: "ERROR",
              message: `Reviewer stopped this run: ${refused.provider} refused ${refusals.length} sentences (check its model and settings)`,
              sentences: refusals.map((r) => String(r.sentence._id)),
              provider: refused.provider,
              outcome: refused.outcome,
            });
            break run;
          }
        } else if (attempts.length > 0 && attempts.every((a) => NOT_THROUGH.has(a.outcome))) {
          // Didn't get through: decided at the end of the run
          await Sentence.updateOne(where, { $set: { lastTriedAt } });
          failedReviews.push({ sentence, result });
        } else if (
          attempts.length > 0 &&
          attempts.every(isCheck) &&
          attempts[attempts.length - 1].outcome === "invalid" &&
          sentence.safetyInvalidShow !== sentence.show
        ) {
          // The safety check or the welfare check answered, but not in its
          // form: tried again once, and saved as a hold if it does the same
          // for the same words again
          await Sentence.updateOne(where, { $set: { safetyInvalidShow: sentence.show, lastTriedAt } });
        } else {
          await save(sentence, result);
        }

        // Out of free requests, or the key is refused: every other request
        // this run would fail the same way, so stop here. Only when the
        // safety check or the welfare check was (nothing gets past either),
        // or every provider asked was: one blocked provider with a later one
        // answering is fine.
        const checkBlocked = attempts.find((a) => isCheck(a) && BLOCKED.has(a.outcome));
        const providerAttempts = attempts.filter((a) => !isCheck(a));
        const blocked = checkBlocked
          ? checkBlocked
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

  try {
    // A refusal from a provider that refused only this one sentence: the
    // hold is saved. (Two or more stopped the run, and none is saved.)
    for (const refusals of refusedBy.values()) {
      if (refusals.length < REFUSALS_THAT_STOP) for (const { sentence, result } of refusals) await save(sentence, result);
    }
    // A failure counts towards MAX_FAILED_RUNS only when a provider that
    // failed it (failed or timed out, whatever else was out of free requests)
    // answered for another sentence this run
    for (const { sentence, result } of failedReviews) {
      const id = String(sentence._id);
      const failedAt = result.attempts.filter((a) => FAILED.has(a.outcome)).map((a) => a.provider);
      const specific = failedAt.some((provider) => [...(answeredFor.get(provider) ?? [])].some((other) => other !== id));
      if (!specific) continue;
      const failedCount = (sentence.failedShow === sentence.show ? (sentence.failedCount ?? 0) : 0) + 1;
      if (failedCount >= MAX_FAILED_RUNS) await save(sentence, result);
      else {
        await Sentence.updateOne(
          { _id: sentence._id, show: sentence.show },
          { $set: { failedShow: sentence.show, failedCount } }
        );
      }
    }
  } catch (error) {
    logger.warn(`Reviewer could not finish the run: ${messageOf(error)}`);
  }

  if (stopped === "deadline") logger.warn("Reviewer stopped this run: out of time", { reviewed: count });
  return stopped ? { reviewed: count, stopped } : { reviewed: count };
};

// Whether a teacher has paused Scribbles from the Teacher page
// (models/reviewerSwitch.ts), read at the start of every run and again
// before each sentence, so pausing takes effect from the next sentence with
// no deploy. Logs one line when it is. If the switch can't be read, the run
// does nothing: an off switch that might be on has to count as on, and the
// next run tries again.
const pausedNow = async () => {
  try {
    const { paused } = await readReviewerSwitch();
    if (paused) logger.info("Scribbles is paused from the Teacher page");
    return paused;
  } catch (error) {
    logger.warn(`Reviewer could not read the Teacher page's pause switch, so it stops this run: ${messageOf(error)}`);
    return true;
  }
};

// The sentence's current words have a suggestion. Only if they're still its
// words: a student's edit since then is reviewed on its own.
const markReviewed = (sentence: Waiting) =>
  Sentence.updateOne(
    { _id: sentence._id, show: sentence.show },
    { $set: { reviewedShow: sentence.show, reviewedAt: new Date() } }
  );
