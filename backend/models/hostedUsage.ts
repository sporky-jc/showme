import { createHash } from "node:crypto";
import mongoose from "mongoose";

// Each question the review line asks the hosted model (reviewer/hosted.ts),
// so it keeps within its share of the free daily allowance over a rolling
// 24 hours, worries first, and one child can't use it all. Holds no words:
// what it was about, when, and a hash of the child's id (never the id).
// Kept two days, then removed by the database.
const hostedUsageSchema = new mongoose.Schema({
  at: { type: Date, required: true },
  about: { type: String, enum: ["worry", "writing"], required: true },
  kid: { type: String, required: true },
});
hostedUsageSchema.index({ at: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 });
hostedUsageSchema.index({ kid: 1, at: 1 });

export const HostedUsage = mongoose.model("HostedUsage", hostedUsageSchema);

const DAY = 24 * 60 * 60 * 1000;

export const kidHash = (gid: string) => createHash("sha256").update(`hosted-usage|${gid}`).digest("hex").slice(0, 24);

export const hostedAskedSince = async (now: Date, kid?: string) =>
  HostedUsage.countDocuments({ at: { $gt: new Date(now.getTime() - DAY) }, ...(kid ? { kid: { $eq: kid } } : {}) });

export const noteHostedAsk = (now: Date, about: "worry" | "writing", kid: string) => HostedUsage.create({ at: now, about, kid });
