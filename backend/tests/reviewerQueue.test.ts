import { describe, expect, it, vi } from "vitest";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { reviewWaitingSentences } from "../reviewer/queue.js";
import type { ReviewProvider, SafetyCheck } from "../reviewer/reviewer.js";
import type { ReviewerSetup } from "../reviewer/settings.js";
import { createUser } from "./helpers.js";

// The scheduled reviewer: reviews waiting sentences and saves suggestions,
// with stand-in providers (no real request is sent).

const TELL = "It is cold outside.";
const GOOD = "My breath puffed out like a little cloud, and the grass crunched.";

const safe: SafetyCheck = { name: "guard", check: async () => "safe" };
const approving = (): ReviewProvider & { review: ReturnType<typeof vi.fn> } => ({
  name: "ai",
  review: vi.fn(async () => ({ verdict: "approve", tip: "great" })),
});
const setupWith = (providers: ReviewProvider[], overrides: Partial<ReviewerSetup> = {}): ReviewerSetup => ({
  mode: "suggest",
  safety: safe,
  providers,
  ...overrides,
});

const addSentence = async (fields: Record<string, unknown> = {}) => {
  const author = await createUser({ id: `g-${Math.random()}`, email: `${Math.random()}@example.com` });
  return Sentence.create({ title: "Cold", tell: TELL, show: GOOD, author: author._id, GID: author.id, ...fields });
};

describe("the scheduled reviewer", () => {
  it("does nothing when off", async () => {
    await addSentence();
    const ai = approving();

    expect(await reviewWaitingSentences(setupWith([ai], { mode: "off" }))).toEqual({ reviewed: 0 });
    expect(ai.review).not.toHaveBeenCalled();
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
  });

  it("does nothing until a safety check and a provider are set up", async () => {
    await addSentence();
    expect(await reviewWaitingSentences(setupWith([]))).toEqual({ reviewed: 0 });
    expect(await reviewWaitingSentences(setupWith([approving()], { safety: undefined }))).toEqual({ reviewed: 0 });
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
  });

  it("saves a suggestion for each waiting sentence, and changes nothing about the sentence", async () => {
    const waiting = await addSentence();
    await addSentence({ approved: true });
    await addSentence({ toRedo: true });

    expect(await reviewWaitingSentences(setupWith([approving()]))).toEqual({ reviewed: 1 });

    const saved = await ReviewSuggestion.find().lean();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ show: GOOD, verdict: "approve", tip: "great", reasons: ["ai"], decidedBy: "ai" });
    expect(String(saved[0].sentence)).toBe(String(waiting._id));
    expect(await Sentence.findById(waiting._id).lean()).toMatchObject({ approved: false, toRedo: false });
  });

  it("reviews a sentence once, and again after the student edits it", async () => {
    const sentence = await addSentence();
    const ai = approving();
    await reviewWaitingSentences(setupWith([ai]));
    await reviewWaitingSentences(setupWith([ai]));
    expect(ai.review).toHaveBeenCalledTimes(1);

    await Sentence.updateOne({ _id: sentence._id }, { show: "The wind bit my ears like a little dog." });
    await reviewWaitingSentences(setupWith([ai]));

    expect(ai.review).toHaveBeenCalledTimes(2);
    expect(await ReviewSuggestion.countDocuments({ sentence: sentence._id })).toBe(2);
  });

  it("saves the rules' hold without asking any provider", async () => {
    await addSentence({ show: "My email is kid@example.com and my fingers froze." });
    const ai = approving();

    await reviewWaitingSentences(setupWith([ai]));

    expect(ai.review).not.toHaveBeenCalled();
    expect(await ReviewSuggestion.findOne().lean()).toMatchObject({ verdict: "unsure", reasons: ["personal-details"], decidedBy: "rules" });
  });

  it("tries again later when every provider failed or ran out", async () => {
    await addSentence();
    const down: ReviewProvider = { name: "down", review: async () => Promise.reject(new Error("HTTP 429")) };

    expect(await reviewWaitingSentences(setupWith([down]))).toEqual({ reviewed: 0 });
    expect(await ReviewSuggestion.countDocuments()).toBe(0);

    expect(await reviewWaitingSentences(setupWith([approving()]))).toEqual({ reviewed: 1 });
  });

  it("reviews at most a few sentences per run", async () => {
    for (let i = 0; i < 4; i++) await addSentence({ show: `${GOOD} ${i}` });

    expect(await reviewWaitingSentences(setupWith([approving()]), { limit: 3 })).toEqual({ reviewed: 3 });
    expect(await reviewWaitingSentences(setupWith([approving()]), { limit: 3 })).toEqual({ reviewed: 1 });
  });

  it("never logs a student's words", async () => {
    const { logger } = await import("firebase-functions/logger");
    await addSentence();

    await reviewWaitingSentences(setupWith([approving()]));

    expect(JSON.stringify(vi.mocked(logger.write).mock.calls)).not.toContain("puffed");
  });
});
