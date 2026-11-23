import mongoose from "mongoose";

// The Neurons the sense tagger spent each UTC day (tagger/queue.ts), so it
// stops at its daily budget across runs: one small document a day, the
// day's date as its id ("2026-11-23"). Cloudflare's free Neurons also reset
// at 00:00 UTC.
const taggerUsageSchema = new mongoose.Schema({
  _id: { type: String },
  neurons: { type: Number, default: 0 },
});

const TaggerUsage = mongoose.model("TaggerUsage", taggerUsageSchema);

const dayOf = (now: Date) => now.toISOString().slice(0, 10);

export const taggerNeuronsToday = async (now: Date) =>
  (await TaggerUsage.findById(dayOf(now)).lean<{ neurons?: number }>())?.neurons ?? 0;

export const addTaggerNeurons = async (now: Date, neurons: number) => {
  if (neurons > 0) await TaggerUsage.updateOne({ _id: dayOf(now) }, { $inc: { neurons } }, { upsert: true });
};
