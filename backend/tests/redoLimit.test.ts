import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { reviewWaitingSentences } from "../reviewer/queue.js";
import {
  MAX_SEND_BACKS,
  reviewSentence,
  type ReviewProvider,
  type SafetyCheck,
  type WelfareCheck,
} from "../reviewer/reviewer.js";
import { asReviewed, createAdmin, createSentence, createUser, fieldsOf, SENTENCE_FIELDS, sessionCookie } from "./helpers.js";

// At most two "Try again"s for one sentence: the count of send-backs kept on
// the sentence (redoCount, models/sentences.ts), and Scribbles leaving a
// third to the teacher (MAX_SEND_BACKS, reviewer/reviewer.ts).

const COLD = "It is cold outside.";
const GOOD = "My breath puffed out like a little cloud, and the grass crunched.";
const safety: SafetyCheck = { name: "guard", check: async () => "safe" };
const welfare: WelfareCheck = { name: "welfare", check: async () => ({ concern: "no" }) };
const worried: WelfareCheck = { name: "welfare", check: async () => ({ concern: "yes" }) };
const answering = (answer: unknown): ReviewProvider => ({ name: "ai", review: async () => answer });
const redoing = answering({ verdict: "redo", tip: "hear" });
const approving = answering({ verdict: "approve", tip: "great" });

// The count as stored (it's never read by default)
const redoCountOf = async (id: unknown) =>
  (await Sentence.findById(id).select("+redoCount").lean().orFail()).redoCount;

const decide = (admin: { id: string }, status: "approve" | "redo", sentence: { _id: unknown; createdAt: Date }, tip?: string) =>
  request(app)
    .patch("/Admin")
    .set("Cookie", sessionCookie(admin))
    .send({ status, sentence: asReviewed(sentence), ...(tip ? { tip } : {}) });

const edit = (user: { id: string }, title: string, show: string) =>
  request(app).patch("/MyPage").set("Cookie", sessionCookie(user)).send({ title, show });

describe("the count of send-backs", () => {
  it("goes up with each teacher's send-back, with or without a tip, and a student's edit never resets it", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const sentence = await createSentence(user);
    expect(await redoCountOf(sentence._id)).toBeUndefined();

    expect((await decide(admin, "redo", sentence, "hear")).status).toBe(201);
    expect(await redoCountOf(sentence._id)).toBe(1);

    expect((await edit(user, sentence.title, "Clothes covered the whole floor.")).status).toBe(201);
    expect(await redoCountOf(sentence._id)).toBe(1);

    const edited = await Sentence.findById(sentence._id).orFail();
    expect((await decide(admin, "redo", edited)).status).toBe(201);
    expect(await redoCountOf(sentence._id)).toBe(2);

    await edit(user, sentence.title, "Socks and shirts covered the floor like snow.");
    const again = await Sentence.findById(sentence._id).orFail();
    expect((await decide(admin, "approve", again)).status).toBe(201);
    // An approval isn't a send-back
    expect(await redoCountOf(sentence._id)).toBe(2);
  });

  it("goes down when a send-back is taken back, and never below 0", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const sentence = await createSentence(user);
    await decide(admin, "redo", sentence, "hear");
    expect(await redoCountOf(sentence._id)).toBe(1);

    const undo = await request(app)
      .patch("/Admin/undo")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "redo", sentence: asReviewed(sentence) });
    expect(undo.status).toBe(201);
    expect(await redoCountOf(sentence._id)).toBe(0);

    // Sent back before the count was kept: nothing to take off
    const older = await createSentence(user, { title: "Day 2", toRedo: true });
    await request(app)
      .patch("/Admin/undo")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "redo", sentence: asReviewed(older) });
    expect(await redoCountOf(older._id)).toBeUndefined();
  });

  it("is never sent to the student, the gallery or the Teacher page", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const sentence = await createSentence(user, { redoCount: 2, approved: true });
    await createSentence(user, { title: "Day 2", redoCount: 1 });

    const own = await request(app).get("/MyPage").set("Cookie", sessionCookie(user));
    const gallery = await request(app).get("/Collections");
    const queue = await request(app).get("/Admin").set("Cookie", sessionCookie(admin));

    for (const res of [own, gallery, queue]) {
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(JSON.stringify(res.body)).not.toContain("redoCount");
    }
    expect(fieldsOf(own.body[0])).toEqual(SENTENCE_FIELDS);
    expect(await redoCountOf(sentence._id)).toBe(2);
  });
});

describe("Scribbles and the limit of two send-backs", () => {
  it("suggests a send-back for a sentence sent back fewer than two times", async () => {
    for (const sentBack of [0, 1]) {
      const { suggestion } = await reviewSentence({ tell: COLD, show: GOOD }, [redoing], { safety, welfare, sentBack });
      expect(suggestion).toEqual({ verdict: "redo", tip: "hear", reasons: ["ai"], decidedBy: "ai" });
    }
  });

  it("leaves a third send-back from the AI to the teacher", async () => {
    expect(MAX_SEND_BACKS).toBe(2);
    for (const sentBack of [2, 3]) {
      const { suggestion } = await reviewSentence({ tell: COLD, show: GOOD }, [redoing], { safety, welfare, sentBack });
      expect(suggestion).toEqual({ verdict: "unsure", tip: null, reasons: ["ai", "redo-limit"], decidedBy: "ai" });
    }
  });

  it("leaves a third send-back from the writing checks to the teacher, with the mistakes still listed", async () => {
    const { suggestion } = await reviewSentence({ tell: COLD, show: "my breth puffed out" }, [approving], {
      safety,
      welfare,
      sentBack: 2,
    });
    expect(suggestion).toEqual({
      verdict: "unsure",
      tip: null,
      reasons: ["ai", "spelling", "punctuation", "redo-limit"],
      decidedBy: "ai",
      misspelled: ["breth"],
      mechanics: [
        { kind: "capital-start", text: "my" },
        { kind: "end-mark", text: "out" },
      ],
    });
  });

  it("leaves a third send-back for a copy of the Tell to the teacher", async () => {
    const { suggestion } = await reviewSentence({ tell: COLD, show: COLD }, [], { safety, welfare, sentBack: 2 });
    expect(suggestion).toEqual({ verdict: "unsure", tip: null, reasons: ["copies-tell", "redo-limit"], decidedBy: "rules" });
  });

  it("still approves a sentence that's ready, however many times it was sent back", async () => {
    const { suggestion } = await reviewSentence({ tell: COLD, show: GOOD }, [approving], { safety, welfare, sentBack: 5 });
    expect(suggestion).toEqual({ verdict: "approve", tip: "great", reasons: ["ai"], decidedBy: "ai" });
  });

  it("leaves holds as they are: they were never send-backs", async () => {
    const held = await reviewSentence({ tell: COLD, show: "Email me at sam@example.com." }, [redoing], {
      safety,
      welfare,
      sentBack: 2,
    });
    expect(held.suggestion).toEqual({ verdict: "unsure", tip: null, reasons: ["personal-details"], decidedBy: "rules" });

    const worrying = await reviewSentence({ tell: COLD, show: GOOD }, [redoing], { safety, welfare: worried, sentBack: 2 });
    expect(worrying.suggestion).toEqual({
      verdict: "unsure",
      tip: null,
      reasons: ["worrying", "welfare-check"],
      decidedBy: "welfare",
    });
  });

  it("is applied by the scheduled reviewer, from the sentence's own count", async () => {
    const user = await createUser();
    const twice = await createSentence(user, { tell: COLD, show: GOOD, redoCount: 2 });
    const once = await createSentence(user, { title: "Day 2", tell: COLD, show: GOOD, redoCount: 1 });
    const ai = { name: "ai", review: vi.fn(async () => ({ verdict: "redo", tip: "hear" })) };

    await reviewWaitingSentences({ mode: "suggest", safety, welfare, providers: [ai] });

    expect(await ReviewSuggestion.findOne({ sentence: twice._id }).lean()).toMatchObject({
      verdict: "unsure",
      tip: null,
      reasons: ["ai", "redo-limit"],
    });
    expect(await ReviewSuggestion.findOne({ sentence: once._id }).lean()).toMatchObject({ verdict: "redo", tip: "hear" });
  });
});
