import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import {
  CLAIM_MS,
  ReviewLine,
  claimWork,
  currentAnswers,
  enterLine,
  hashShow,
  recordFailure,
  saveAnswer,
  versionOf,
  type CurrentVersions,
} from "../models/reviewLine.js";

// The review line's records (tasks/scribbles-worker-spec.md, T8). Made-up
// sentences only.

const SENTENCE = new mongoose.Types.ObjectId();
const WORDS = "My breath puffed out like a little cloud.";
const EDITED = "My breath puffed out like a tiny cloud.";
const WELFARE = versionOf("the welfare question");
const GEMMA = "gemma4:e4b@abc";

const waitingFor = async (show = WORDS) => {
  const line = await enterLine(SENTENCE, show);
  line.needs.push({ reader: "first", question: "welfare" });
  await line.save();
  return line;
};

const answer = (line: { _id: mongoose.Types.ObjectId }, more: Partial<Parameters<typeof saveAnswer>[0]> = {}) => ({
  line: line._id,
  showHash: hashShow(WORDS),
  reader: "first" as const,
  question: "welfare" as const,
  model: GEMMA,
  questionVersion: WELFARE,
  answer: "no",
  ...more,
});

describe("the review line", () => {
  it("keeps no words and no author: a version is known by a hash of its words", async () => {
    await enterLine(SENTENCE, WORDS);
    const [stored] = await ReviewLine.find().lean();
    expect(JSON.stringify(stored)).not.toContain("breath");
    expect(Object.keys(stored)).not.toContain("author");
    expect(stored.showHash).toBe(hashShow(WORDS));
  });

  it("keeps the same version's place when the words haven't changed", async () => {
    const first = await enterLine(SENTENCE, WORDS);
    const again = await enterLine(SENTENCE, WORDS);
    expect(again._id).toEqual(first._id);
    expect(await ReviewLine.countDocuments()).toBe(1);
  });

  it("replaces an older version when the student edits: its answers stop counting", async () => {
    const line = await waitingFor();
    expect(await saveAnswer(answer(line))).toBe("saved");
    const edited = await enterLine(SENTENCE, EDITED);
    expect(edited._id).not.toEqual(line._id);
    expect(edited.answers).toHaveLength(0);
    expect((await ReviewLine.findById(line._id))?.state).toBe("replaced");
  });
});

describe("claims", () => {
  it("hands a version to one worker at a time, and again once the claim runs out after 15 minutes", async () => {
    const line = await waitingFor();
    const now = new Date("2026-11-27T10:00:00Z");
    expect((await claimWork("first", "worker-a", 5, now)).map((l) => l._id)).toEqual([line._id]);
    expect(await claimWork("first", "worker-b", 5, now)).toEqual([]);
    expect(await claimWork("first", "worker-b", 5, new Date(now.getTime() + CLAIM_MS - 1))).toEqual([]);
    expect(await claimWork("first", "worker-b", 5, new Date(now.getTime() + CLAIM_MS))).toHaveLength(1);
  });

  it("never gives two workers asking at once the same version", async () => {
    for (let i = 0; i < 6; i++) {
      const line = await enterLine(new mongoose.Types.ObjectId(), `${WORDS} ${i}`);
      line.needs.push({ reader: "first", question: "welfare" });
      await line.save();
    }
    const [a, b] = await Promise.all([claimWork("first", "worker-a", 6), claimWork("first", "worker-b", 6)]);
    const ids = [...a, ...b].map((l) => String(l._id));
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it("hands out only versions that need that reader, and claims each reader separately", async () => {
    await waitingFor();
    expect(await claimWork("second", "worker-a", 5)).toEqual([]);
    expect(await claimWork("first", "worker-a", 5)).toHaveLength(1);
  });

  it("frees the claim when an answer or a failure comes in", async () => {
    const line = await waitingFor();
    await claimWork("first", "worker-a", 1);
    await recordFailure(line._id, "first");
    expect((await ReviewLine.findById(line._id))?.failedTries?.first).toBe(1);
    expect(await claimWork("first", "worker-b", 1)).toHaveLength(1);
  });
});

describe("answers", () => {
  it("takes an answered question off what the version needs, so the worker isn't handed it again", async () => {
    const line = await waitingFor();
    await ReviewLine.updateOne({ _id: line._id }, { $push: { needs: { reader: "first", question: "checklist" } } });
    expect(await claimWork("first", "vm", 5)).toHaveLength(1);
    expect(await saveAnswer(answer(line))).toBe("saved");
    // Still needed: the checklist. The welfare question is done.
    expect((await ReviewLine.findById(line._id).lean())?.needs).toEqual([{ reader: "first", question: "checklist" }]);
    await saveAnswer(answer(line, { question: "checklist", questionVersion: "c", answer: {} }));
    expect((await ReviewLine.findById(line._id).lean())?.needs).toEqual([]);
    expect(await claimWork("first", "vm", 5)).toHaveLength(0);
    // The same answer again (a duplicate) also clears it, if it was set again meanwhile
    await ReviewLine.updateOne({ _id: line._id }, { $push: { needs: { reader: "first", question: "welfare" } } });
    expect(await saveAnswer(answer(line))).toBe("duplicate");
    expect((await ReviewLine.findById(line._id).lean())?.needs).toEqual([]);
  });

  it("counts the same answer posted twice once", async () => {
    const line = await waitingFor();
    expect(await saveAnswer(answer(line))).toBe("saved");
    expect(await saveAnswer(answer(line))).toBe("duplicate");
    expect((await ReviewLine.findById(line._id))?.answers).toHaveLength(1);
  });

  it("refuses an answer for words that have since changed", async () => {
    const line = await waitingFor();
    await enterLine(SENTENCE, EDITED);
    expect(await saveAnswer(answer(line))).toBe("stale");
    // ... or posted with other words' hash
    const edited = await enterLine(SENTENCE, EDITED);
    expect(await saveAnswer(answer(edited, { showHash: hashShow(WORDS) }))).toBe("stale");
  });

  it("refuses an answer for a version already decided", async () => {
    const line = await waitingFor();
    await ReviewLine.updateOne({ _id: line._id }, { $set: { state: "decided" } });
    expect(await saveAnswer(answer(line))).toBe("stale");
  });

  it("doesn't count answers from another model or question version", async () => {
    const line = await waitingFor();
    await saveAnswer(answer(line));
    await saveAnswer(answer(line, { model: "gemma4:e4b@old", answer: "yes" }));
    const stored = (await ReviewLine.findById(line._id).lean())!;
    const current: CurrentVersions = { first: { model: GEMMA, questions: { welfare: WELFARE } } };
    expect(currentAnswers(stored, current).map((a) => a.answer)).toEqual(["no"]);
    // A changed question: none count, so it's read again
    expect(currentAnswers(stored, { first: { model: GEMMA, questions: { welfare: versionOf("new words") } } })).toEqual([]);
  });
});
