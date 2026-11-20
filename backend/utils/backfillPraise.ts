import { Sentence } from "../models/sentences.js";
import { PRAISE } from "../reviewer/tips.js";

// Approved sentences from before tips existed (step 3) have none, so their
// students see no "Great picture!" bubble. New approvals get the praise tip
// when the teacher approves (controllers/routes.ts). See
// scripts/backfill-praise.ts.

// Approved, with no tip: missing, or null
const WITHOUT_PRAISE = { approved: true, tip: { $in: [null] } };

export const countWithoutPraise = async () => ({
  approved: await Sentence.countDocuments({ approved: true }),
  withoutTip: await Sentence.countDocuments(WITHOUT_PRAISE),
});

// Gives them the praise tip. Never changes a sentence that has a tip or
// isn't approved, so running it again changes nothing.
export const backfillPraise = async () => {
  const result = await Sentence.updateMany(WITHOUT_PRAISE, { $set: { tip: PRAISE } });
  return result.modifiedCount;
};
