import { describe, expect, it, vi } from "vitest";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { MAX_AGE_DAYS, RUN_DEADLINE_MS, reviewWaitingSentences } from "../reviewer/queue.js";
import { ProviderError } from "../reviewer/providers/http.js";
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

  it("saves what each provider answered with the suggestion, for the audit trail", async () => {
    const sentence = await addSentence();
    await reviewWaitingSentences(setupWith([approving()]));

    const saved = await ReviewSuggestion.findOne({ sentence: sentence._id }).lean();
    expect(saved?.attempts).toEqual([
      { provider: "guard", outcome: "safe", ms: expect.any(Number) },
      { provider: "ai", outcome: "answered", ms: expect.any(Number) },
    ]);
    const stored = await Sentence.findById(sentence._id, "+reviewedShow +reviewedAt").lean();
    expect(stored).toMatchObject({ reviewedShow: GOOD, reviewedAt: expect.any(Date) });
  });

  // More held sentences waiting for a teacher than one look used to read
  // (200) must never stop a new sentence from being reviewed
  it("still finds a new sentence behind any number of sentences already reviewed", async () => {
    const author = await createUser({ id: "g-many", email: "many@example.com" });
    const old = Date.now() - 24 * 60 * 60 * 1000;
    const many = Array.from({ length: 250 }, (_, i) => ({
      title: `day${i}`,
      tell: TELL,
      show: `${GOOD} ${i}`,
      author: author._id,
      GID: author.id,
      createdAt: new Date(old + i * 1000),
      reviewedShow: `${GOOD} ${i}`,
      reviewedAt: new Date(),
    }));
    const inserted = await Sentence.insertMany(many);
    await ReviewSuggestion.insertMany(
      inserted.map((s) => ({ sentence: s._id, show: s.show, verdict: "unsure", reasons: ["worrying"], decidedBy: "rules" }))
    );
    const fresh = await addSentence({ show: "The wind bit my ears like a little dog." });
    const ai = approving();

    expect(await reviewWaitingSentences(setupWith([ai]))).toEqual({ reviewed: 1 });
    expect(ai.review).toHaveBeenCalledTimes(1);
    expect(await ReviewSuggestion.findOne({ sentence: fresh._id }).lean()).toMatchObject({ verdict: "approve" });
  });

  it("notes a suggestion saved before sentences kept what was reviewed, without asking again", async () => {
    const sentence = await addSentence();
    await ReviewSuggestion.create({ sentence: sentence._id, show: GOOD, verdict: "approve", tip: "great", reasons: ["ai"], decidedBy: "ai" });
    const ai = approving();

    expect(await reviewWaitingSentences(setupWith([ai]))).toEqual({ reviewed: 0 });
    expect(ai.review).not.toHaveBeenCalled();
    expect(await Sentence.findById(sentence._id, "+reviewedShow").lean()).toMatchObject({ reviewedShow: GOOD });
  });

  it(`leaves sentences waiting more than ${MAX_AGE_DAYS} days alone`, async () => {
    await addSentence({ createdAt: new Date(Date.now() - (MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000) });
    const ai = approving();

    expect(await reviewWaitingSentences(setupWith([ai]))).toEqual({ reviewed: 0 });
    expect(ai.review).not.toHaveBeenCalled();
  });

  // An unchanged resubmission keeps its suggestion (right for "suggest"
  // mode, where the teacher reads it), and is never reviewed in a loop
  it("keeps the suggestion when a student sends the same words again, and doesn't review them again", async () => {
    const sentence = await addSentence();
    const ai = approving();
    await reviewWaitingSentences(setupWith([ai]));
    // Sent back by the teacher, then sent again unchanged (as editUserSentence does)
    await Sentence.updateOne({ _id: sentence._id }, { toRedo: true });
    await Sentence.updateOne({ _id: sentence._id }, { $set: { show: GOOD, createdAt: new Date(), toRedo: false } });

    for (let run = 0; run < 3; run++) expect(await reviewWaitingSentences(setupWith([ai]))).toEqual({ reviewed: 0 });
    expect(ai.review).toHaveBeenCalledTimes(1);
    expect(await ReviewSuggestion.countDocuments({ sentence: sentence._id })).toBe(1);
  });

  it("stops the whole run when a provider is out of free requests (HTTP 429)", async () => {
    for (let i = 0; i < 5; i++) await addSentence({ show: `${GOOD} ${i}` });
    const limited = { name: "ai", review: vi.fn(async () => Promise.reject(new ProviderError("HTTP 429", 429))) };

    expect(await reviewWaitingSentences(setupWith([limited]))).toEqual({ reviewed: 0, stopped: "rate-limited" });
    expect(limited.review).toHaveBeenCalledTimes(1);
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
  });

  it("stops the whole run when the safety check is out of free requests", async () => {
    for (let i = 0; i < 3; i++) await addSentence({ show: `${GOOD} ${i}` });
    const check = vi.fn(async () => Promise.reject(new ProviderError("HTTP 429", 429)));
    const ai = approving();

    expect(await reviewWaitingSentences(setupWith([ai], { safety: { name: "guard", check } }))).toEqual({
      reviewed: 0,
      stopped: "rate-limited",
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(ai.review).not.toHaveBeenCalled();
  });

  it("stops the whole run when a key is refused (HTTP 401 or 403), and logs it as an error", async () => {
    const { logger } = await import("firebase-functions/logger");
    for (let i = 0; i < 3; i++) await addSentence({ show: `${GOOD} ${i}` });
    const refused = { name: "ai", review: vi.fn(async () => Promise.reject(new ProviderError("HTTP 403", 403))) };

    expect(await reviewWaitingSentences(setupWith([refused]))).toEqual({ reviewed: 0, stopped: "credentials" });
    expect(refused.review).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(logger.write).mock.calls)).toContain("credentials");
    // And tries again on the next run
    expect(await reviewWaitingSentences(setupWith([approving()]))).toEqual({ reviewed: 3 });
  });

  it(`starts no new review after the run's deadline (${RUN_DEADLINE_MS / 1000} seconds by default)`, async () => {
    for (let i = 0; i < 5; i++) await addSentence({ show: `${GOOD} ${i}`, createdAt: new Date(Date.now() - (5 - i) * 1000) });
    let clock = 0;
    const ai = { name: "ai", review: vi.fn(async () => {
      clock += 100; // each review takes 100 "milliseconds"
      return { verdict: "approve", tip: "great" };
    }) };

    expect(await reviewWaitingSentences(setupWith([ai]), { deadlineMs: 250, now: () => clock })).toEqual({
      reviewed: 3,
      stopped: "deadline",
    });
    expect(ai.review).toHaveBeenCalledTimes(3);
    // The rest are reviewed on the next run
    expect(await reviewWaitingSentences(setupWith([ai]))).toEqual({ reviewed: 2 });
  });

  it("tries an invalid safety answer again on a later run, once, then saves the hold", async () => {
    const sentence = await addSentence();
    const check = vi.fn(async () => "probably fine" as "safe");
    const ai = approving();
    const setup = setupWith([ai], { safety: { name: "guard", check } });

    expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 0 });
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 1 });
    expect(await ReviewSuggestion.findOne({ sentence: sentence._id }).lean()).toMatchObject({
      verdict: "unsure",
      reasons: ["no-safety-check"],
    });
    expect(check).toHaveBeenCalledTimes(2);
    expect(ai.review).not.toHaveBeenCalled();
    // Done: not asked a third time
    await reviewWaitingSentences(setup);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("a good answer after one invalid safety answer is saved as usual", async () => {
    await addSentence();
    let answer = "garbled";
    const setup = setupWith([approving()], { safety: { name: "guard", check: async () => answer as "safe" } });

    expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 0 });
    answer = "safe";
    expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 1 });
    expect(await ReviewSuggestion.findOne().lean()).toMatchObject({ verdict: "approve" });
  });
});
