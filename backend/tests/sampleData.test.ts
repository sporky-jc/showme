import { describe, expect, it, vi } from "vitest";
import Profile from "../models/profile.js";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { reviewSentence, type ReviewProvider, type SafetyCheck } from "../reviewer/reviewer.js";
import { reviewWaitingSentences } from "../reviewer/queue.js";
import { PRAISE } from "../reviewer/tips.js";
import { backfillPraise, countWithoutPraise } from "../utils/backfillPraise.js";
import { DEMO_SENTENCES, SAMPLE_SENTENCES, SAMPLE_STUDENTS, seedDemoAccount, seedSampleData } from "../utils/sampleData.js";
import { createSentence, createUser } from "./helpers.js";

// The practice database's made-up sample data (utils/sampleData.ts), and the
// one-time praise tip for sentences approved before tips existed
// (utils/backfillPraise.ts)

const safe: SafetyCheck = { name: "guard", check: async () => "safe" };
const approving: ReviewProvider = { name: "ai", review: async () => ({ verdict: "approve", tip: "great" }) };

describe("the sample data", () => {
  it("gives every approved sentence the praise, and sent-back ones their tip", async () => {
    await seedSampleData();

    const sentences = await Sentence.find().lean();
    expect(sentences).toHaveLength(SAMPLE_SENTENCES.length);
    for (const sentence of sentences.filter((s) => s.approved)) {
      expect(sentence.tip).toBe(PRAISE);
    }
    const redo = sentences.filter((s) => s.toRedo);
    expect(redo.map((s) => s.tip ?? null)).toEqual(
      expect.arrayContaining(["showNotTell", "feel", "action", "endMark", "capitals", null])
    );
    expect(sentences.filter((s) => !s.approved && !s.toRedo && s.tip)).toEqual([]);
  });

  it("gives each student one sentence per Tell, and likes only from other students", async () => {
    await seedSampleData();

    const sentences = await Sentence.find().lean();
    const titles = sentences.map((s) => `${s.GID} ${s.title}`);
    expect(new Set(titles).size).toBe(titles.length);
    const profiles = await Profile.find().lean();
    expect(profiles).toHaveLength(SAMPLE_STUDENTS.length);
    for (const sentence of sentences) {
      expect(sentence.likedBy.map(String)).not.toContain(String(sentence.author));
    }
  });

  it("replaces only its own data when run again, suggestions included", async () => {
    const student = await createUser();
    const real = await createSentence(student);
    const first = await seedSampleData();
    await ReviewSuggestion.create({ sentence: first.waiting[0], show: "Old words.", verdict: "approve", decidedBy: "ai" });

    const second = await seedSampleData();

    expect(await Sentence.countDocuments()).toBe(SAMPLE_SENTENCES.length + 1);
    expect(await Sentence.findById(real._id)).not.toBeNull();
    expect(await Profile.countDocuments()).toBe(SAMPLE_STUDENTS.length + 1);
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    expect(second.waiting).toHaveLength(SAMPLE_SENTENCES.filter(([, , , s]) => "waiting" in s).length);
  });

  it("has waiting sentences that make each kind of Scribbles note", async () => {
    const outcome = async (kind: string) => {
      const [, , show] = SAMPLE_SENTENCES.find(([, , , s]) => "waiting" in s && s.waiting === kind)!;
      return (await reviewSentence({ tell: "It is cold outside.", show }, [approving], { safety: safe })).suggestion;
    };

    expect((await outcome("check-in")).reasons).toContain("worrying");
    expect((await outcome("personal")).reasons).toContain("personal-details");
    expect(await outcome("ready")).toMatchObject({ verdict: "approve" });
    expect(await outcome("spelling")).toMatchObject({ verdict: "redo", misspelled: ["slowley", "cieling"] });
    expect((await outcome("capitals")).mechanics?.map((m) => m.kind)).toEqual(
      expect.arrayContaining(["capital-start", "lowercase-i", "end-mark"])
    );
    expect((await outcome("punctuation")).mechanics?.map((m) => m.kind)).toEqual(
      expect.arrayContaining(["space-before-mark", "no-space-after-mark"])
    );
  });

  it("Scribbles can review just the waiting sample sentences", async () => {
    const student = await createUser();
    await createSentence(student, { createdAt: new Date(0) });
    const { waiting } = await seedSampleData();
    const ai = { ...approving, review: vi.fn(approving.review) };

    const { reviewed } = await reviewWaitingSentences(
      { mode: "suggest", safety: safe, providers: [ai] },
      { limit: waiting.length, only: { _id: { $in: waiting } } }
    );

    const suggested = await ReviewSuggestion.find().lean();
    expect(suggested.map((s) => String(s.sentence)).sort()).toEqual(waiting.map(String).sort());
    expect(reviewed).toBe(waiting.length);
  });
});

describe("sample sentences for a real staging account", () => {
  it("show every state on its My sentences, and make it a teacher", async () => {
    await seedSampleData();
    const me = await createUser({ id: "g-me", email: "me@example.com" });

    const result = await seedDemoAccount("me@example.com");

    expect(result).toMatchObject({ added: DEMO_SENTENCES.length, skipped: 0 });
    const mine = await Sentence.find({ GID: "g-me" }).lean();
    expect(mine.filter((s) => s.approved).every((s) => s.tip === PRAISE && s.likedBy.length > 0)).toBe(true);
    expect(mine.filter((s) => s.toRedo).map((s) => s.tip ?? null)).toEqual(
      expect.arrayContaining(["taste", "spelling", null])
    );
    expect(mine.filter((s) => !s.approved && !s.toRedo)).toHaveLength(result!.waiting.length);
    const profile = await Profile.findById(me._id).lean();
    expect(profile?.isAdmin).toBe(true);
    expect(profile?.ownSentences).toHaveLength(DEMO_SENTENCES.length);
  });

  it("never touch the account's own sentences, and skip Tells it already wrote for", async () => {
    const me = await createUser({ id: "g-me", email: "me@example.com" });
    const own = await createSentence(me, { title: `day${DEMO_SENTENCES[0][0]}`, show: "My own words." });

    await seedDemoAccount("me@example.com");
    const again = await seedDemoAccount("me@example.com");

    expect(again).toMatchObject({ added: DEMO_SENTENCES.length - 1, skipped: 1 });
    expect(await Sentence.findById(own._id).lean()).toMatchObject({ show: "My own words." });
    expect(await Sentence.countDocuments({ GID: "g-me" })).toBe(DEMO_SENTENCES.length);
  });

  it("need the account to have signed in once", async () => {
    expect(await seedDemoAccount("nobody@example.com")).toBeNull();
    expect(await Sentence.countDocuments()).toBe(0);
  });

  it("make the notes they're written for", async () => {
    const review = async (show: string) =>
      (await reviewSentence({ tell: "It is cold outside.", show }, [approving], { safety: safe })).suggestion;
    for (const [, show, state] of DEMO_SENTENCES) {
      if (!("waiting" in state)) continue;
      expect(await review(show)).toMatchObject({ verdict: state.waiting === "ready" ? "approve" : "redo" });
    }
    expect((await review(DEMO_SENTENCES[3][1])).misspelled).toEqual(["potatos", "smeled"]);
  });
});

describe("the praise tip for older approvals", () => {
  it("is given to approved sentences without a tip, and nothing else", async () => {
    const student = await createUser();
    const old = await createSentence(student, { title: "day1", approved: true });
    const praised = await createSentence(student, { title: "day2", approved: true, tip: PRAISE });
    const redo = await createSentence(student, { title: "day3", toRedo: true, tip: "hear" });
    const waiting = await createSentence(student, { title: "day4" });

    expect(await countWithoutPraise()).toEqual({ approved: 2, withoutTip: 1 });
    expect(await backfillPraise()).toBe(1);

    const tipOf = async (id: unknown) => (await Sentence.findById(id).lean())?.tip;
    expect(await tipOf(old._id)).toBe(PRAISE);
    expect(await tipOf(praised._id)).toBe(PRAISE);
    expect(await tipOf(redo._id)).toBe("hear");
    expect(await tipOf(waiting._id)).toBeUndefined();
  });

  it("changes nothing when run again", async () => {
    const student = await createUser();
    await createSentence(student, { approved: true });

    expect(await backfillPraise()).toBe(1);
    expect(await backfillPraise()).toBe(0);
    expect(await countWithoutPraise()).toEqual({ approved: 1, withoutTip: 0 });
  });
});
