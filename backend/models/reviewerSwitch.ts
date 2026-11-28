import mongoose from "mongoose";
import { SUGGESTION_SOURCES } from "../reviewer/contract.js";

// The Teacher page's off switch for Scribbles, the scheduled reviewer
// (reviewer/queue.ts): one document, read at the start of every run and
// again before each sentence is sent to the AI. REVIEWER_MODE, set by the
// deploy, says whether Scribbles may run at all; changing it takes a new
// deploy, tens of minutes. This switch takes effect from the next sentence,
// with no deploy. It can only pause: with REVIEWER_MODE "off", nothing runs
// whatever it says.
//
// It names no teacher: who flipped it, and when, is in that request's log
// line (its userId, see middlewares/requestLog.ts), as for a decision.
// No document yet means never paused.
const SWITCH_ID = "reviewer";

export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number];

// The deploy's default, from the GitHub variable STAGING_SUGGESTIONS_FROM
// or PRODUCTION_SUGGESTIONS_FROM: the old reviewer's unless it says "line"
export const defaultSuggestionSource = (env = process.env): SuggestionSource => (env.SUGGESTIONS_FROM === "line" ? "line" : "old");

const reviewerSwitchSchema = new mongoose.Schema({
  _id: { type: String, default: SWITCH_ID },
  paused: { type: Boolean, default: false, required: true },
  // When it was last paused, for the Teacher page ("paused since ...").
  // Cleared when Scribbles is turned back on.
  pausedAt: { type: Date },
  // Which suggestions the Teacher page's cards show, when a teacher picked
  // one there: the old reviewer's ("old") or the review line's ("line").
  // Not stored: the deploy's default (SUGGESTIONS_FROM) is used.
  suggestionsFrom: { type: String, enum: SUGGESTION_SOURCES },
});

const ReviewerSwitch = mongoose.model("ReviewerSwitch", reviewerSwitchSchema);

// The switch as stored: not paused when nothing was ever stored
export const readReviewerSwitch = async (): Promise<{ paused: boolean; pausedAt?: Date }> => {
  const stored = await ReviewerSwitch.findById(SWITCH_ID).lean<{ paused?: boolean; pausedAt?: Date }>();
  return { paused: stored?.paused === true, ...(stored?.pausedAt ? { pausedAt: stored.pausedAt } : {}) };
};

// Pauses Scribbles, or turns him back on. Pausing again keeps the first
// pausedAt, so the page still says since when.
export const setReviewerPaused = async (paused: boolean) => {
  if (!paused) {
    await ReviewerSwitch.updateOne({ _id: SWITCH_ID }, { $set: { paused: false }, $unset: { pausedAt: "" } });
    return readReviewerSwitch();
  }
  // Stored and on: paused from now
  const { matchedCount } = await ReviewerSwitch.updateOne(
    { _id: SWITCH_ID, paused: { $ne: true } },
    { $set: { paused: true, pausedAt: new Date() } }
  );
  if (matchedCount === 0) {
    // Never stored (paused from now), or already paused (left as it is)
    try {
      await ReviewerSwitch.updateOne(
        { _id: SWITCH_ID },
        { $setOnInsert: { paused: true, pausedAt: new Date() } },
        { upsert: true }
      );
    } catch (error) {
      // Another teacher's pause stored it first, at the same moment
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  return readReviewerSwitch();
};

// Which suggestions the cards show now: the Teacher page's pick, or else
// the deploy's default
export const readSuggestionSource = async (env = process.env) => {
  const stored = await ReviewerSwitch.findById(SWITCH_ID, { suggestionsFrom: 1 }).lean<{ suggestionsFrom?: SuggestionSource }>();
  const fallback = defaultSuggestionSource(env);
  return { now: stored?.suggestionsFrom ?? fallback, default: fallback };
};

// A teacher picks the source on the Teacher page, or goes back to the
// deploy's default ("default")
export const setSuggestionSource = async (source: SuggestionSource | "default") => {
  await ReviewerSwitch.updateOne(
    { _id: SWITCH_ID },
    source === "default" ? { $unset: { suggestionsFrom: "" } } : { $set: { suggestionsFrom: source } },
    { upsert: true }
  );
};

export { ReviewerSwitch };
