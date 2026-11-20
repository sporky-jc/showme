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
});

// Finding a student's sentence for a day (POST /MyPage checks there isn't
// one yet; PATCH /MyPage edits it). Not unique: older data may hold two for
// one day, and a unique index couldn't be built over them. The server keeps
// to one per day itself (see createNewUserSentence).
sentenceSchema.index({ GID: 1, title: 1 });

// Creating mongoose model
const Sentence = mongoose.model("Sentence", sentenceSchema);

// A sentence's fields, as TypeScript reads them from the schema above
export type SentenceFields = mongoose.InferSchemaType<typeof sentenceSchema>;

export { Sentence };
