import mongoose from "mongoose";
import { TIP_IDS } from "../reviewer/tips.js";

// User sentence schema
const sentenceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  tell: { type: String, required: true },
  show: { type: String, required: true },
  hideedit: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Profile",
    required: true,
  },
  toRedo: {
    type: Boolean,
    default: false,
  },
  approved: {
    type: Boolean,
    default: false,
  },
  // The profiles of the students who liked it, each at most once (see
  // controllers/likes.ts). Its like count is worked out from this, never
  // stored: 1 for passing review, plus one per entry. (Older sentences may
  // also hold a likeCount of 0 from before likes existed; nothing reads it.)
  likedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },
  ],
  GID: { type: String, required: true },
  // The tip from Scribbles' list (reviewer/tips.ts) the student sees with
  // their teacher's decision: one they chose with "Try again", or the
  // praise tip once approved. Cleared when the student edits the sentence.
  tip: { type: String, enum: TIP_IDS },
  // For Scribbles' scheduled reviewer only (reviewer/queue.ts): the exact
  // words it last saved a suggestion for, and when, so it can find the
  // sentences still to review in one query. Never read by default (select:
  // false), and not in any answer the contract sends (contract/api.ts), so
  // they never reach a student, the gallery or the Teacher page. Left alone
  // when a student edits: an edit with new words no longer matches
  // `reviewedShow`, so it's reviewed again; an unchanged resubmission keeps
  // its suggestion.
  reviewedShow: { type: String, select: false },
  reviewedAt: { type: Date, select: false },
  // The words the safety check last gave an invalid answer about: a second
  // invalid answer for the same words is saved as a hold, so one bad answer
  // is tried again on a later run, but never forever (reviewer/queue.ts)
  safetyInvalidShow: { type: String, select: false },
  // "<GID>|<title>", set only when a sentence is written through POST
  // /MyPage (see dayKeyOf), so one student can't have two for a day even
  // when two requests arrive together. Never changed afterwards, and never
  // sent to the website (the answers in contract/api.ts don't list it).
  dayKey: { type: String },
});

// Finding a student's sentence for a day (POST /MyPage checks there isn't
// one yet; PATCH /MyPage edits it). Not unique: older data may hold two for
// one day, and a unique index couldn't be built over them.
sentenceSchema.index({ GID: 1, title: 1 });
// One sentence per student per day, for every sentence that has a dayKey.
// Older sentences (and sample data) have none, so they're left out of the
// index: it builds even where old duplicates exist.
sentenceSchema.index(
  { dayKey: 1 },
  { unique: true, partialFilterExpression: { dayKey: { $exists: true } } }
);

// A sentence's dayKey: its author and its day
export const dayKeyOf = (gid: string, title: string) => `${gid}|${title}`;

// Creating mongoose model
const Sentence = mongoose.model("Sentence", sentenceSchema);

// A sentence's fields, as TypeScript reads them from the schema above
export type SentenceFields = mongoose.InferSchemaType<typeof sentenceSchema>;

export { Sentence };
