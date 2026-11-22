import { describe, expect, it, vi } from "vitest";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { ReviewerSwitch, setReviewerPaused } from "../models/reviewerSwitch.js";
import { MAX_AGE_DAYS, MAX_FAILED_RUNS, RUN_DEADLINE_MS, reviewWaitingSentences } from "../reviewer/queue.js";
import { ProviderError } from "../reviewer/providers/http.js";
import { cloudflareSafety } from "../reviewer/providers/cloudflare.js";
import type { ReviewProvider, SafetyCheck, WelfareCheck } from "../reviewer/reviewer.js";
import type { ReviewerSetup } from "../reviewer/settings.js";
import request from "supertest";
import app from "../app.js";
import { createUser, sessionCookie } from "./helpers.js";

// The scheduled reviewer: reviews waiting sentences and saves suggestions,
// with stand-in providers (no real request is sent).

const TELL = "It is cold outside.";
const GOOD = "My breath puffed out like a little cloud, and the grass crunched.";

const safe: SafetyCheck = { name: "guard", check: async () => "safe" };
const calm: WelfareCheck = { name: "welfare", check: async () => ({ concern: "no" }) };
const approving = (): ReviewProvider & { review: ReturnType<typeof vi.fn> } => ({
  name: "ai",
  review: vi.fn(async () => ({ verdict: "approve", tip: "great" })),
});
const setupWith = (providers: ReviewProvider[], overrides: Partial<ReviewerSetup> = {}): ReviewerSetup => ({
  mode: "suggest",
  safety: safe,
  welfare: calm,
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
    // ... and the welfare check: without it, every sentence would be held
    expect(await reviewWaitingSentences(setupWith([approving()], { welfare: undefined }))).toEqual({ reviewed: 0 });
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
      { provider: "welfare", outcome: "no-concern", ms: expect.any(Number) },
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

  // The real Llama Guard reader, through the whole chain: an answer in no
  // known form is "invalid", tried again once, then saved as a hold
  it("tries a real invalid safety answer again once, then saves the hold", async () => {
    const sentence = await addSentence();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, result: { response: "probably fine" } })));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const ai = approving();
      const setup = setupWith([ai], { safety: cloudflareSafety({ accountId: "a", token: "t" }) });

      expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 0 });
      expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 1 });
      expect(await ReviewSuggestion.findOne({ sentence: sentence._id }).lean()).toMatchObject({
        verdict: "unsure",
        reasons: ["no-safety-check"],
        attempts: [{ outcome: "invalid" }],
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(ai.review).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Sentences that fail the same way every run must not block newer ones
  it(`puts sentences that keep failing behind new ones, and holds them after ${MAX_FAILED_RUNS} failed runs`, async () => {
    const BAD = "The wind is a broken record.";
    for (let i = 0; i < 10; i++) {
      await addSentence({ show: `${BAD} ${i}`, createdAt: new Date(Date.now() - (20 - i) * 60_000) });
    }
    const fresh = await addSentence({ show: "The wind bit my ears like a little dog." });
    // Fails for the broken ones (as a provider might for an input it can't
    // read), answers for the rest
    const ai = {
      name: "ai",
      review: vi.fn(async ({ show }: { show: string }) => {
        if (show.startsWith(BAD)) throw new Error("Unexpected answer from Workers AI");
        return { verdict: "approve", tip: "great" };
      }),
    };

    // Run 1: the ten older ones, all failing; run 2: the new one first
    expect(await reviewWaitingSentences(setupWith([ai]))).toEqual({ reviewed: 0 });
    expect(await reviewWaitingSentences(setupWith([ai]))).toMatchObject({ reviewed: 1 });
    expect(await ReviewSuggestion.findOne({ sentence: fresh._id }).lean()).toMatchObject({ verdict: "approve" });

    // Each broken one fails while the provider answers for other sentences
    // (a new one each run), so the failure is the sentence's: held after
    // its third such run. (Run 1 didn't count: nothing else got through.)
    for (let run = 0; run < 6; run++) {
      await addSentence({ show: `The wind bit my ears like a dog ${run}.` });
      await reviewWaitingSentences(setupWith([ai]));
    }
    const held = await ReviewSuggestion.find({ show: { $regex: `^${BAD}` } }).lean();
    expect(held).toHaveLength(10);
    for (const suggestion of held) {
      expect(suggestion).toMatchObject({ verdict: "unsure", reasons: ["no-provider"], decidedBy: "none" });
    }
    const asked = ai.review.mock.calls.length;
    await reviewWaitingSentences(setupWith([ai]));
    expect(ai.review.mock.calls.length).toBe(asked);
  });

  // A short outage fails every sentence: none of them is to blame
  it("holds nothing after an outage, and reviews everything once it's over", async () => {
    for (let i = 0; i < 5; i++) await addSentence({ show: `${GOOD} ${i}` });
    let down = true;
    const check = vi.fn(async () => {
      if (down) throw new Error("read ECONNRESET");
      return "safe" as const;
    });
    const setup = setupWith([approving()], { safety: { name: "guard", check } });

    for (let run = 0; run < 3; run++) expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 0 });
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    down = false;
    expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 5 });
    // (Reviewed by the AI, none held for want of a safety check)
    expect((await ReviewSuggestion.find().lean()).map((s) => s.decidedBy)).toEqual(Array(5).fill("ai"));
  });

  it("counts a failure even when another provider was out of free requests", async () => {
    const BAD = "The wind is a broken record.";
    const broken = await addSentence({ show: BAD, createdAt: new Date(Date.now() - 60_000) });
    const first = {
      name: "first",
      review: vi.fn(async ({ show }: { show: string }) => {
        if (show === BAD) throw new Error("Unexpected answer from Workers AI");
        return { verdict: "approve", tip: "great" };
      }),
    };
    const limited = { name: "second", review: vi.fn(async () => Promise.reject(new ProviderError("HTTP 429", 429))) };

    for (let run = 0; run < MAX_FAILED_RUNS; run++) {
      await addSentence({ show: `${GOOD} ${run}` });
      await reviewWaitingSentences(setupWith([first, limited]));
    }
    expect(await ReviewSuggestion.findOne({ sentence: broken._id }).lean()).toMatchObject({ reasons: ["no-provider"] });
  });

  it("puts an edited sentence back in line with the new ones", async () => {
    const author = await createUser({ id: "g-edit", email: "edit@example.com" });
    const sentence = await Sentence.create({ title: "day1", tell: TELL, show: GOOD, author: author._id, GID: author.id });
    await Sentence.collection.updateOne({ _id: sentence._id }, { $set: { lastTriedAt: new Date(), failedShow: GOOD, failedCount: 1 } });

    const res = await request(app)
      .patch("/MyPage")
      .set("Cookie", sessionCookie(author))
      .send({ title: "day1", show: "The wind bit my ears like a little dog." });

    expect(res.status).toBe(201);
    expect(await Sentence.collection.findOne({ _id: sentence._id })).not.toHaveProperty("lastTriedAt");
  });

  it("tries a sentence again when the model isn't found (HTTP 404), and holds nothing", async () => {
    await addSentence();
    const missing = { name: "ai", review: vi.fn(async () => Promise.reject(new ProviderError("HTTP 404", 404))) };

    expect(await reviewWaitingSentences(setupWith([missing]))).toEqual({ reviewed: 0 });
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    expect(await reviewWaitingSentences(setupWith([approving()]))).toEqual({ reviewed: 1 });
  });

  it("stops the run when one provider refuses two sentences, and saves neither hold", async () => {
    const { logger } = await import("firebase-functions/logger");
    for (let i = 0; i < 4; i++) await addSentence({ show: `${GOOD} ${i}` });
    const refusing = { name: "ai", review: vi.fn(async () => Promise.reject(new ProviderError("HTTP 400", 400))) };

    expect(await reviewWaitingSentences(setupWith([refusing]))).toEqual({ reviewed: 0, stopped: "configuration" });
    expect(refusing.review).toHaveBeenCalledTimes(2);
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    const logged = JSON.stringify(vi.mocked(logger.write).mock.calls);
    expect(logged).toContain("ERROR");
    expect(logged).not.toContain("puffed");
    // Once fixed, they're reviewed as usual
    expect(await reviewWaitingSentences(setupWith([approving()]))).toEqual({ reviewed: 4 });
  });

  it("saves a hold at once when the API refuses the request (another HTTP 4xx)", async () => {
    const sentence = await addSentence();
    const refusing = { name: "ai", review: vi.fn(async () => Promise.reject(new ProviderError("HTTP 400", 400))) };

    expect(await reviewWaitingSentences(setupWith([refusing]))).toEqual({ reviewed: 1 });
    expect(await ReviewSuggestion.findOne({ sentence: sentence._id }).lean()).toMatchObject({
      verdict: "unsure",
      reasons: ["no-provider"],
      attempts: [{ outcome: "safe" }, { outcome: "no-concern" }, { outcome: "refused" }],
    });
  });

  it("keeps going when one provider is out of free requests but a later one answers", async () => {
    for (let i = 0; i < 3; i++) await addSentence({ show: `${GOOD} ${i}` });
    const limited = { name: "first", review: vi.fn(async () => Promise.reject(new ProviderError("HTTP 429", 429))) };

    expect(await reviewWaitingSentences(setupWith([limited, approving()]))).toEqual({ reviewed: 3 });
    expect(limited.review).toHaveBeenCalledTimes(3);
  });

  it("stops when every provider asked is out of free requests", async () => {
    for (let i = 0; i < 3; i++) await addSentence({ show: `${GOOD} ${i}` });
    const limited = (name: string) => ({ name, review: vi.fn(async () => Promise.reject(new ProviderError("HTTP 429", 429))) });
    const [first, second] = [limited("first"), limited("second")];

    expect(await reviewWaitingSentences(setupWith([first, second]))).toEqual({ reviewed: 0, stopped: "rate-limited" });
    expect(first.review).toHaveBeenCalledTimes(1);
    expect(second.review).toHaveBeenCalledTimes(1);
  });
});

// The welfare check in the scheduled reviewer: it fails closed like the
// safety check, and stops a run the same way when it's out of free requests
// or its key is refused
describe("the scheduled reviewer and the welfare check", () => {
  const HINT = "My tummy growled all night because the fridge was empty again and nobody came home.";
  const welfareWith = (check: WelfareCheck["check"]) => ({ name: "welfare", check: vi.fn(check) });

  it("saves a worrying hold when it's worried, without asking the reviewer", async () => {
    const sentence = await addSentence({ show: HINT });
    const ai = approving();
    const welfare = welfareWith(async () => ({ concern: "yes" }));

    expect(await reviewWaitingSentences(setupWith([ai], { welfare }))).toEqual({ reviewed: 1 });
    expect(await ReviewSuggestion.findOne({ sentence: sentence._id }).lean()).toMatchObject({
      verdict: "unsure",
      reasons: ["worrying", "welfare-check"],
      decidedBy: "welfare",
      attempts: [{ provider: "guard", outcome: "safe" }, { provider: "welfare", outcome: "concern" }],
    });
    expect(ai.review).not.toHaveBeenCalled();
  });

  it("checks a copy of the Tell too, before it's sent back", async () => {
    const sentence = await addSentence({ show: TELL });
    const welfare = welfareWith(async () => ({ concern: "yes" }));

    expect(await reviewWaitingSentences(setupWith([approving()], { welfare }))).toEqual({ reviewed: 1 });
    expect(welfare.check).toHaveBeenCalledTimes(1);
    expect(await ReviewSuggestion.findOne({ sentence: sentence._id }).lean()).toMatchObject({
      verdict: "unsure",
      reasons: ["worrying", "welfare-check"],
    });
  });

  it("stops the whole run when it's out of free requests, and holds nothing", async () => {
    for (let i = 0; i < 3; i++) await addSentence({ show: `${GOOD} ${i}` });
    const welfare = welfareWith(async () => Promise.reject(new ProviderError("HTTP 429", 429)));
    const ai = approving();

    expect(await reviewWaitingSentences(setupWith([ai], { welfare }))).toEqual({ reviewed: 0, stopped: "rate-limited" });
    expect(welfare.check).toHaveBeenCalledTimes(1);
    expect(ai.review).not.toHaveBeenCalled();
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    // And reviews them once it's back
    expect(await reviewWaitingSentences(setupWith([ai]))).toEqual({ reviewed: 3 });
  });

  it("stops the whole run when its key is refused, and logs it as an error", async () => {
    const { logger } = await import("firebase-functions/logger");
    for (let i = 0; i < 3; i++) await addSentence({ show: `${GOOD} ${i}` });
    const welfare = welfareWith(async () => Promise.reject(new ProviderError("HTTP 401", 401)));

    expect(await reviewWaitingSentences(setupWith([approving()], { welfare }))).toEqual({ reviewed: 0, stopped: "credentials" });
    expect(welfare.check).toHaveBeenCalledTimes(1);
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    expect(JSON.stringify(vi.mocked(logger.write).mock.calls)).toContain("ERROR");
  });

  it("tries an invalid answer again on a later run, once, then saves a worrying hold", async () => {
    const sentence = await addSentence();
    const welfare = welfareWith(async () => "Probably fine, nothing to see.");
    const ai = approving();
    const setup = setupWith([ai], { welfare });

    expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 0 });
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 1 });
    expect(await ReviewSuggestion.findOne({ sentence: sentence._id }).lean()).toMatchObject({
      verdict: "unsure",
      reasons: ["worrying", "no-welfare-check"],
      decidedBy: "none",
      attempts: [{ outcome: "safe" }, { outcome: "invalid" }],
    });
    expect(welfare.check).toHaveBeenCalledTimes(2);
    expect(ai.review).not.toHaveBeenCalled();
    await reviewWaitingSentences(setup);
    expect(welfare.check).toHaveBeenCalledTimes(2);
  });

  it("holds nothing after an outage, and reviews everything once it's over", async () => {
    for (let i = 0; i < 4; i++) await addSentence({ show: `${GOOD} ${i}` });
    let down = true;
    const welfare = welfareWith(async () => {
      if (down) throw new Error("read ECONNRESET");
      return { concern: "no" };
    });
    const setup = setupWith([approving()], { welfare });

    for (let run = 0; run < MAX_FAILED_RUNS + 1; run++) expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 0 });
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    down = false;
    expect(await reviewWaitingSentences(setup)).toEqual({ reviewed: 4 });
    expect((await ReviewSuggestion.find().lean()).map((s) => s.decidedBy)).toEqual(Array(4).fill("ai"));
  });

  it(`saves a worrying hold for a sentence it fails on ${MAX_FAILED_RUNS} runs in a row while it answers for others`, async () => {
    const broken = await addSentence({ show: HINT, createdAt: new Date(Date.now() - 60_000) });
    const welfare = welfareWith(async ({ show }) => {
      if (show === HINT) throw new Error("Unexpected answer from Workers AI");
      return { concern: "no" };
    });

    for (let run = 0; run < MAX_FAILED_RUNS; run++) {
      await addSentence({ show: `${GOOD} ${run}` });
      await reviewWaitingSentences(setupWith([approving()], { welfare }));
    }
    expect(await ReviewSuggestion.findOne({ sentence: broken._id }).lean()).toMatchObject({
      verdict: "unsure",
      reasons: ["worrying", "no-welfare-check"],
      decidedBy: "none",
    });
  });

  it("saves a worrying hold at once when its API refuses the request", async () => {
    const sentence = await addSentence();
    const welfare = welfareWith(async () => Promise.reject(new ProviderError("HTTP 400", 400)));

    expect(await reviewWaitingSentences(setupWith([approving()], { welfare }))).toEqual({ reviewed: 1 });
    expect(await ReviewSuggestion.findOne({ sentence: sentence._id }).lean()).toMatchObject({
      reasons: ["worrying", "no-welfare-check"],
      attempts: [{ outcome: "safe" }, { outcome: "refused" }],
    });
  });

  it("is never asked when the safety check is out of free requests", async () => {
    await addSentence();
    const welfare = welfareWith(async () => ({ concern: "no" }));
    const safety = { name: "guard", check: vi.fn(async () => Promise.reject(new ProviderError("HTTP 429", 429))) };

    expect(await reviewWaitingSentences(setupWith([approving()], { safety, welfare }))).toEqual({
      reviewed: 0,
      stopped: "rate-limited",
    });
    expect(welfare.check).not.toHaveBeenCalled();
  });
});

// The Teacher page's off switch (models/reviewerSwitch.ts, PATCH
// /Admin/reviewer): a paused Scribbles sends nothing to the AI, from the
// next sentence on, with no deploy
describe("the scheduled reviewer, paused from the Teacher page", () => {
  it("does nothing while paused, and says so in one line", async () => {
    await addSentence();
    await setReviewerPaused(true);
    const ai = approving();
    const safety = { name: "guard", check: vi.fn(async () => "safe" as const) };
    const { logger } = await import("firebase-functions/logger");
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    expect(await reviewWaitingSentences(setupWith([ai], { safety }))).toEqual({ reviewed: 0, stopped: "paused" });

    expect(ai.review).not.toHaveBeenCalled();
    expect(safety.check).not.toHaveBeenCalled();
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    expect(info.mock.calls).toEqual([["Scribbles is paused from the Teacher page"]]);
    expect(warn).not.toHaveBeenCalled();
    info.mockRestore();
    warn.mockRestore();
  });

  it("reviews again once turned back on", async () => {
    await addSentence();
    await setReviewerPaused(true);
    await reviewWaitingSentences(setupWith([approving()]));
    await setReviewerPaused(false);

    expect(await reviewWaitingSentences(setupWith([approving()]))).toEqual({ reviewed: 1 });
  });

  it("stops before the next sentence when paused during a run, and keeps what was already saved", async () => {
    await addSentence({ show: `${GOOD} 1` });
    await addSentence({ show: `${GOOD} 2` });
    const ai = approving();
    // A teacher pauses while the first sentence is with the AI
    ai.review.mockImplementationOnce(async () => {
      await setReviewerPaused(true);
      return { verdict: "approve", tip: "great" };
    });

    expect(await reviewWaitingSentences(setupWith([ai]))).toEqual({ reviewed: 1, stopped: "paused" });
    expect(ai.review).toHaveBeenCalledTimes(1);
    expect(await ReviewSuggestion.countDocuments()).toBe(1);
  });

  it("does nothing when the switch can't be read", async () => {
    await addSentence();
    const ai = approving();
    vi.spyOn(ReviewerSwitch, "findById").mockImplementationOnce(() => {
      throw new Error("database down");
    });

    expect(await reviewWaitingSentences(setupWith([ai]))).toEqual({ reviewed: 0, stopped: "paused" });
    expect(ai.review).not.toHaveBeenCalled();
  });

  // REVIEWER_MODE, from the deploy, is the ceiling: the switch only pauses
  it("can't turn on a reviewer the deploy has off", async () => {
    await addSentence();
    await setReviewerPaused(false);
    const ai = approving();

    expect(await reviewWaitingSentences(setupWith([ai], { mode: "off" }))).toEqual({ reviewed: 0 });
    expect(ai.review).not.toHaveBeenCalled();
  });
});

describe("test-account sentences", () => {
  it("are never reviewed, so QA Wolf's runs don't use up the AI allowance", async () => {
    const real = await addSentence();
    const author = await createUser({ id: "test-student-1", email: "test-student-1@example.com" });
    const testSentence = await Sentence.create({ title: "Cold", tell: TELL, show: GOOD, author: author._id, GID: author.id });
    const ai = approving();

    expect(await reviewWaitingSentences(setupWith([ai]))).toEqual({ reviewed: 1 });
    expect(await ReviewSuggestion.exists({ sentence: real._id })).toBeTruthy();
    expect(await ReviewSuggestion.exists({ sentence: testSentence._id })).toBeNull();
    expect(ai.review).toHaveBeenCalledTimes(1);
  });
});

