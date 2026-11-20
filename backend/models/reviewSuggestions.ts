import mongoose from "mongoose";
import { REASONS, VERDICTS } from "../reviewer/contract.js";
import { TIP_IDS } from "../reviewer/tips.js";

// What the reviewer (reviewer/reviewer.ts) suggested for a sentence, kept
// apart from the sentence itself: nothing that sends sentences to students
// or the gallery ever reads this collection, so a suggestion can't leak to
// them. Step 3 shows them to the teacher.
//
// One per version of a sentence: `show` is the exact text reviewed, so a
// student's edit makes a suggestion out of date, and the sentence is
// reviewed again.
const reviewSuggestionSchema = new mongoose.Schema({
  sentence: { type: mongoose.Schema.Types.ObjectId, ref: "Sentence", required: true },
  show: { type: String, required: true },
  verdict: { type: String, enum: VERDICTS, required: true },
  tip: { type: String, enum: [...TIP_IDS, null], default: null },
  reasons: [{ type: String, enum: REASONS }],
  // "rules", a provider's name, or "none"
  decidedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
reviewSuggestionSchema.index({ sentence: 1, show: 1 }, { unique: true });

const ReviewSuggestion = mongoose.model("ReviewSuggestion", reviewSuggestionSchema);

export { ReviewSuggestion };
