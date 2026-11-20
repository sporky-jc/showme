import { describe, expect, it } from "vitest";
import { Sentence } from "../models/sentences.js";
import Profile from "../models/profile.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { cleanQueue, countQueueClutter } from "../utils/cleanQueue.js";
import { DEMO_SENTENCES, SAMPLE_SENTENCES, seedDemoAccount, seedSampleData } from "../utils/sampleData.js";
import { createSentence, createUser } from "./helpers.js";

// Clearing old sentences off the practice database's Teacher page, so only
// the sample sentences are waiting there (utils/cleanQueue.ts)

const HOUR = 60 * 60 * 1000;
const longAgo = new Date(Date.now() - 3 * HOUR);

describe("clearing old sentences off the Teacher page", () => {
  it("counts and deletes old waiting sentences from test and other accounts", async () => {
    const tester = await createUser({ id: "test-student-1", email: "t@showme.test" });
    const someone = await createUser({ id: "123456", email: "someone@example.com" });
    const oldTest = await createSentence(tester, { createdAt: longAgo });
    const oldReal = await createSentence(someone, { title: "day2", createdAt: longAgo });
    await ReviewSuggestion.create({ sentence: oldReal._id, show: oldReal.show, verdict: "approve", decidedBy: "ai" });
    someone.ownSentences.push(oldReal._id);
    await someone.save();

    expect(await countQueueClutter()).toEqual({ total: 2, testAccounts: 1, otherSentences: 1, otherAccounts: 1 });
    expect(await cleanQueue()).toBe(2);

    expect(await Sentence.findById(oldTest._id)).toBeNull();
    expect(await Sentence.findById(oldReal._id)).toBeNull();
    expect(await ReviewSuggestion.countDocuments()).toBe(0);
    expect((await Profile.findById(someone._id).lean())?.ownSentences).toEqual([]);
  });

  it("keeps the samples, demo sentences, recent ones, and everything approved or sent back", async () => {
    await seedSampleData();
    const me = await createUser({ id: "g-me", email: "me@example.com" });
    await seedDemoAccount("me@example.com");
    await Sentence.updateMany({}, { createdAt: longAgo });
    const recent = await createSentence(me, { title: "day30" });
    await createSentence(me, { title: "day31", approved: true, createdAt: longAgo });
    await createSentence(me, { title: "day32", toRedo: true, createdAt: longAgo });
    const before = await Sentence.countDocuments();

    expect((await countQueueClutter()).total).toBe(0);
    expect(await cleanQueue()).toBe(0);

    expect(await Sentence.countDocuments()).toBe(before);
    expect(await Sentence.findById(recent._id)).not.toBeNull();
    expect(before).toBe(SAMPLE_SENTENCES.length + DEMO_SENTENCES.length + 3);
  });

  it("counts a sentence with no date as old", async () => {
    const someone = await createUser({ id: "123456", email: "someone@example.com" });
    const undated = await createSentence(someone);
    await Sentence.collection.updateOne({ _id: undated._id }, { $unset: { createdAt: "" } });

    expect(await cleanQueue()).toBe(1);
  });
});
