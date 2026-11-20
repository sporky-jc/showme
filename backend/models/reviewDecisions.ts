import mongoose from "mongoose";
import { TIP_IDS } from "../reviewer/tips.js";

// Every decision a teacher makes on the Teacher page (PATCH /Admin), one
// record each, kept apart from the sentence. The sentence itself only holds
// its latest state, and a student's edit puts it back to waiting, so without
// these a "Try again" is forgotten as soon as the student rewrites it. The
// shadow report (scripts/shadow-report.ts) compares these with Scribbles'
// suggestions to see how often the two agree.
//
// `show` is the exact words the teacher decided on, so a decision is only
// ever compared with a suggestion for those same words. Never sent to a
// browser, and it names no teacher: the report only needs what was decided
// and when.
const reviewDecisionSchema = new mongoose.Schema({
  sentence: { type: mongoose.Schema.Types.ObjectId, ref: "Sentence", required: true },
  show: { type: String, required: true },
  status: { type: String, enum: ["approve", "redo"], required: true },
  // The tip the student got: the praise with an approval, the teacher's
  // choice (or none) with "redo"
  tip: { type: String, enum: [...TIP_IDS, null], default: null },
  // Who decided. Only "teacher" today; an automatic mode would say "scribbles"
  // here, so the report can keep the two apart.
  decidedBy: { type: String, enum: ["teacher"], default: "teacher", required: true },
  decidedAt: { type: Date, default: Date.now, required: true },
});
reviewDecisionSchema.index({ sentence: 1, show: 1 });

const ReviewDecision = mongoose.model("ReviewDecision", reviewDecisionSchema);

export { ReviewDecision };
