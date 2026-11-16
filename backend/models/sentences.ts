import mongoose from "mongoose";

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
});

// Creating mongoose model
const Sentence = mongoose.model("Sentence", sentenceSchema);

// A sentence's fields, as TypeScript reads them from the schema above
export type SentenceFields = mongoose.InferSchemaType<typeof sentenceSchema>;

export { Sentence };
