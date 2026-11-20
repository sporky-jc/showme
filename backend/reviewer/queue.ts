// Reviews the sentences waiting for the teacher, a few at a time, and saves
// a suggestion for each (models/reviewSuggestions.ts). Run every few minutes
// by the scheduled function in index.ts. In "suggest" mode it changes
// nothing a student or the gallery sees: the teacher still decides.
import { logger } from "firebase-functions/logger";
import type { Types } from "mongoose";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { reviewSentence } from "./reviewer.js";
import type { ReviewerSetup } from "./settings.js";
import { messageOf } from "../utils/errors.js";

// At most this many sentences per run, so one run stays well inside the free
// requests and the time a scheduled function may take
export const SENTENCES_PER_RUN = 10;

export const reviewWaitingSentences = async (
  setup: ReviewerSetup,
  {
    limit = SENTENCES_PER_RUN,
    timeoutMs,
    only = {},
  }: {
    limit?: number;
    timeoutMs?: number;
    // Only the waiting sentences that also match this (scripts/seed-dev.ts
    // reviews just its sample sentences)
    only?: { _id?: { $in: Types.ObjectId[] } };
  } = {}
) => {
  if (setup.mode === "off") return { reviewed: 0 };
  // Not set up yet: review nothing, so every sentence is reviewed once it is
  if (setup.providers.length === 0 || !setup.safety) {
    logger.warn("Reviewer is on but has no safety check or no AI provider set up");
    return { reviewed: 0 };
  }

  // The sentences waiting for the teacher, oldest first, that have no
  // suggestion for their current words
  const waiting = await Sentence.find({ ...only, approved: false, toRedo: false }, { tell: 1, show: 1 })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean<{ _id: Types.ObjectId; tell: string; show: string }[]>();
  const done = await ReviewSuggestion.find(
    { sentence: { $in: waiting.map((s) => s._id) } },
    { sentence: 1, show: 1 }
  ).lean<{ sentence: { toString(): string }; show: string }[]>();
  const reviewed = new Set(done.map((d) => `${d.sentence.toString()} ${d.show}`));
  const todo = waiting.filter((s) => !reviewed.has(`${String(s._id)} ${s.show}`)).slice(0, limit);

  let count = 0;
  for (const sentence of todo) {
    try {
      const { suggestion, attempts } = await reviewSentence(
        { tell: sentence.tell, show: sentence.show },
        setup.providers,
        { safety: setup.safety, timeoutMs }
      );
      // Nobody could decide only because a request failed or took too long
      // (down, or out of free requests until tomorrow): try again on a later
      // run rather than saving "unsure" for good
      const nobodyAnswered =
        suggestion.decidedBy === "none" &&
        attempts.every((a) => a.outcome === "failed" || a.outcome === "timeout" || a.outcome === "safe");
      // Only ids and outcomes are logged, never a student's words
      logger.info("Reviewer suggestion", {
        sentence: String(sentence._id),
        verdict: suggestion.verdict,
        reasons: suggestion.reasons,
        decidedBy: suggestion.decidedBy,
        attempts,
      });
      if (nobodyAnswered) continue;
      await ReviewSuggestion.updateOne(
        { sentence: sentence._id, show: sentence.show },
        { $setOnInsert: { ...suggestion, sentence: sentence._id, show: sentence.show, createdAt: new Date() } },
        { upsert: true }
      );
      count++;
    } catch (error) {
      logger.warn(`Reviewer could not review a sentence: ${messageOf(error)}`, { sentence: String(sentence._id) });
    }
  }
  return { reviewed: count };
};
