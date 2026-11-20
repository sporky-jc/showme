// Clears old sentences out of the Teacher page's queue in the practice
// database (ShowME-dev), so a teacher there sees only the sample sentences
// (utils/sampleData.ts): realistic examples of every kind of Scribbles note.
// Run by scripts/seed-dev.ts --clean-queue, from the "Fill staging with
// sample data" workflow.
//
// "Old" means waiting for review (not approved, not sent back) and written
// more than an hour ago, by anyone but the sample students. Kept:
//   - the sample students' sentences, and the demo sentences of your own
//     account (found by their exact words);
//   - anything written in the last hour, so a QA Wolf run in progress (its
//     test students wipe their own sentences anyway) or a sentence someone
//     is writing now is never touched;
//   - every approved or sent-back sentence: those aren't on the Teacher page.
import type { Types } from "mongoose";
import Profile from "../models/profile.js";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { TEST_SENTENCES } from "../controllers/testLogin.js";
import { DEMO_SENTENCES, SAMPLE_STUDENTS } from "./sampleData.js";

const HOUR = 60 * 60 * 1000;

const oldWaiting = (now: number) => ({
  approved: false,
  toRedo: false,
  GID: { $nin: SAMPLE_STUDENTS.map((s) => s.id) },
  show: { $nin: DEMO_SENTENCES.map(([, show]) => show) },
  // Some early sentences have no date: they are old too
  $or: [{ createdAt: { $lt: new Date(now - HOUR) } }, { createdAt: { $exists: false } }],
});

type Found = { _id: Types.ObjectId; GID: string };

// What would be cleared: counts only, never anyone's words or emails
export const countQueueClutter = async (now = Date.now()) => {
  const found = await Sentence.find(oldWaiting(now), { GID: 1 }).lean<Found[]>();
  const fromTests = found.filter((s) => TEST_SENTENCES.test(s.GID));
  const fromOthers = found.filter((s) => !TEST_SENTENCES.test(s.GID));
  return {
    total: found.length,
    testAccounts: fromTests.length,
    otherSentences: fromOthers.length,
    otherAccounts: new Set(fromOthers.map((s) => s.GID)).size,
  };
};

// Deletes them, with Scribbles' suggestions for them, and takes them off
// their authors' lists of sentences
export const cleanQueue = async (now = Date.now()) => {
  const found = await Sentence.find(oldWaiting(now), { GID: 1 }).lean<Found[]>();
  const ids = found.map((s) => s._id);
  await ReviewSuggestion.deleteMany({ sentence: { $in: ids } });
  await Profile.updateMany({ ownSentences: { $in: ids } }, { $pull: { ownSentences: { $in: ids } } });
  const result = await Sentence.deleteMany({ _id: { $in: ids } });
  return result.deletedCount;
};
