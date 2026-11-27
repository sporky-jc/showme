import { describe, expect, it } from "vitest";
import type { Types } from "mongoose";
import { ReviewLine, hashShow, saveAnswer } from "../models/reviewLine.js";
import { Sentence } from "../models/sentences.js";
import { questionVersion } from "../reviewer/asks.js";
import { WORRY_WAIT_MS } from "../reviewer/decide.js";
import { fillLine, keepLine, stepLine } from "../reviewer/line.js";
import { createSentence, createUser } from "./helpers.js";

// The line keeper (tasks/scribbles-worker-spec.md, T11, first part). Made-up
// sentences only.

const GOOD = "Clothes carpeted the floor like a soft, lumpy rug.";
const CHECKLIST_OK = { suitable: "yes", onTopic: "yes", technique: "yes", shows: "yes", detail: "see", grammar: "yes" };
const MODELS = { safety: "llama-guard3:8b@aaa", first: "gemma4:e4b@bbb", second: "qwen3.5:9b@ccc" } as const;

const sentenceSaying = async (show = GOOD, more = {}) => {
  const n = Math.random().toString(36).slice(2);
  const user = await createUser({ id: `google-${n}`, email: `${n}@example.com` });
  return createSentence(user, { show, ...more });
};
const lineOf = async (sentence: { _id: Types.ObjectId }) => (await ReviewLine.findOne({ sentence: sentence._id, state: { $ne: "replaced" } }).lean())!;

// A local model's answer to one question, as the worker posts it
const answer = async (sentence: { _id: Types.ObjectId; show: string }, reader: "safety" | "first" | "second", question: "safety" | "welfare" | "checklist", value: unknown, model: string = MODELS[reader]) => {
  const line = await lineOf(sentence);
  return saveAnswer({ line: line._id, showHash: hashShow(sentence.show), reader, question, model, questionVersion: questionVersion(question), answer: value });
};

describe("putting sentences in line", () => {
  it("puts in sentences waiting for review, once each", async () => {
    const waiting = await sentenceSaying();
    await sentenceSaying("Approved already.", { approved: true });
    await sentenceSaying("Sent back already.", { toRedo: true });
    await sentenceSaying("Long ago.", { createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) });
    expect(await fillLine()).toBe(1);
    expect(await fillLine()).toBe(0);
    expect((await ReviewLine.find().lean()).map((l) => String(l.sentence))).toEqual([String(waiting._id)]);
  });
});

describe("stepping a version", () => {
  it("asks the local models for what's missing, then the second checklist, then approves", async () => {
    const sentence = await sentenceSaying();
    await fillLine();
    const { _id } = await lineOf(sentence);
    expect(await stepLine(_id)).toEqual({ step: "ask-local", question: "welfare" });
    expect((await lineOf(sentence)).needs).toEqual([
      { reader: "safety", question: "safety" },
      { reader: "first", question: "welfare" },
      { reader: "first", question: "checklist" },
      { reader: "second", question: "welfare" },
    ]);
    await answer(sentence, "safety", "safety", "safe");
    await answer(sentence, "first", "welfare", "no");
    await answer(sentence, "first", "checklist", CHECKLIST_OK);
    await answer(sentence, "second", "welfare", "no");
    expect(await stepLine(_id)).toEqual({ step: "ask-second" });
    expect((await lineOf(sentence)).needs).toEqual([{ reader: "second", question: "checklist" }]);
    await answer(sentence, "second", "checklist", CHECKLIST_OK);
    expect(await stepLine(_id)).toEqual({ step: "approve", tip: "great" });
    const settled = await lineOf(sentence);
    expect(settled.state).toBe("decided");
    expect(settled.decided).toEqual({ step: "approve", tip: "great" });
    expect(settled.needs).toEqual([]);
  });

  it("changes nothing a student or teacher sees: the sentence itself is untouched", async () => {
    const sentence = await sentenceSaying();
    await keepLine();
    const after = await Sentence.findById(sentence._id).lean();
    expect(after?.approved).toBe(false);
    expect(after?.toRedo).toBe(false);
  });

  it("settles an explicit worrying phrase as a teacher's, with nothing for any model", async () => {
    const sentence = await sentenceSaying("I want to die.");
    await fillLine();
    expect(await stepLine((await lineOf(sentence))._id)).toEqual({ step: "teacher", because: "worrying-words" });
    expect((await lineOf(sentence)).needs).toEqual([]);
  });

  it("doesn't count an answer from another model", async () => {
    const sentence = await sentenceSaying();
    await fillLine();
    await answer(sentence, "safety", "safety", "safe", "llama-guard3:1b@zzz");
    await stepLine((await lineOf(sentence))._id);
    expect((await lineOf(sentence)).needs).toContainEqual({ reader: "safety", question: "safety" });
  });

  it("notes the hosted model as needed on a split worry, and a teacher reads it after an hour without an answer", async () => {
    const sentence = await sentenceSaying();
    await fillLine();
    const { _id } = await lineOf(sentence);
    await answer(sentence, "safety", "safety", "safe");
    await answer(sentence, "first", "welfare", "yes");
    await answer(sentence, "first", "checklist", CHECKLIST_OK);
    await answer(sentence, "second", "welfare", "no");
    const now = new Date("2026-11-27T10:00:00Z");
    expect(await stepLine(_id, { now })).toEqual({ step: "ask-hosted", question: "welfare", about: "worry" });
    const waiting = await lineOf(sentence);
    expect(waiting.needs).toEqual([{ reader: "hosted", question: "welfare" }]);
    expect(waiting.worryRaisedAt).toEqual(now);
    expect(await stepLine(_id, { now: new Date(now.getTime() + WORRY_WAIT_MS) })).toEqual({ step: "teacher", because: "worry-not-checked" });
  });

  it("takes a version out of line when the student edits it, or a teacher decides it meanwhile", async () => {
    const edited = await sentenceSaying();
    const decided = await sentenceSaying(`${GOOD} Again.`);
    await fillLine();
    const editedLine = await lineOf(edited);
    const decidedLine = await lineOf(decided);
    await Sentence.updateOne({ _id: edited._id }, { $set: { show: "Clothes covered the floor." } });
    await Sentence.updateOne({ _id: decided._id }, { $set: { approved: true } });
    expect(await stepLine(editedLine._id)).toBeNull();
    expect(await stepLine(decidedLine._id)).toBeNull();
    expect((await ReviewLine.findById(editedLine._id).lean())?.state).toBe("replaced");
    expect((await ReviewLine.findById(decidedLine._id).lean())?.state).toBe("replaced");
  });

  it("counts earlier send-backs for a check, so no loop: the split passes after three", async () => {
    const sentence = await sentenceSaying();
    // Three earlier versions sent back for the grammar check
    for (let i = 0; i < 3; i++) {
      await ReviewLine.create({ sentence: sentence._id, showHash: `old-${i}`, state: "decided", decided: { step: "send-back", tip: "readAloud", check: "grammar" } });
    }
    await fillLine();
    await answer(sentence, "safety", "safety", "safe");
    await answer(sentence, "first", "welfare", "no");
    await answer(sentence, "first", "checklist", CHECKLIST_OK);
    await answer(sentence, "second", "welfare", "no");
    await answer(sentence, "second", "checklist", { ...CHECKLIST_OK, grammar: "no" });
    // Only the second says no, after three send-backs for grammar: it passes
    expect(await stepLine((await lineOf(sentence))._id)).toEqual({ step: "approve", tip: "great" });
  });
});

describe("a whole run", () => {
  it("puts sentences in line and steps every waiting version", async () => {
    await sentenceSaying();
    await sentenceSaying("I want to die.");
    const result = await keepLine();
    expect(result.entered).toBe(2);
    expect(result.stepped).toBe(2);
    expect(result.settled).toEqual({ teacher: 1 });
  });
});
