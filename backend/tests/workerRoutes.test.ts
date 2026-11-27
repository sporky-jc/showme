import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { ReviewLine, enterLine, hashShow } from "../models/reviewLine.js";
import { questionVersion } from "../reviewer/asks.js";
import { WELFARE_INSTRUCTIONS } from "../reviewer/prompt.js";
import { Sentence } from "../models/sentences.js";
import { WORKER_REQUESTS_PER_MINUTE } from "../middlewares/rateLimit.js";
import { createSentence, createUser, fieldsOf } from "./helpers.js";

// The worker's routes (tasks/scribbles-worker-spec.md, T9). Made-up
// sentences only.

const KEY = "k".repeat(40);
const GEMMA = "gemma4:e4b@abc";
const WELFARE = questionVersion("welfare");

const asWorker = (path: string, body: object, key = KEY) =>
  request(app).post(path).set("Authorization", `Bearer ${key}`).send(body);

// A sentence in line, waiting for the first model's welfare answer
const waiting = async (show = "Clothes carpeted the floor.") => {
  const n = Math.random().toString(36).slice(2);
  const user = await createUser({ id: `google-${n}`, email: `${n}@example.com` });
  const sentence = await createSentence(user, { show });
  const line = await enterLine(sentence._id, show);
  line.needs.push({ reader: "first", question: "welfare" });
  await line.save();
  return { sentence, line };
};

beforeEach(() => vi.stubEnv("WORKER_KEY", KEY));
afterEach(() => vi.unstubAllEnvs());

describe("the worker's key", () => {
  it.each([
    ["no key", () => request(app).post("/worker/work").send({ reader: "first", worker: "vm", limit: 1 })],
    ["a wrong key", () => asWorker("/worker/work", { reader: "first", worker: "vm", limit: 1 }, "x".repeat(40))],
    ["a key that's only the start of it", () => asWorker("/worker/work", { reader: "first", worker: "vm", limit: 1 }, KEY.slice(0, 39))],
  ])("gets nothing with %s", async (_name, send) => {
    await waiting();
    const res = await send();
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("Clothes");
  });

  it("limits how often anyone can call, with or without the key, so guessing it is slow", async () => {
    for (let i = 0; i < WORKER_REQUESTS_PER_MINUTE; i++) await asWorker("/worker/work", { reader: "first", worker: "vm", limit: 1 }, "x".repeat(40));
    expect((await asWorker("/worker/work", { reader: "first", worker: "vm", limit: 1 })).status).toBe(429);
  });

  it("lets nobody in when no key, or a short one, is set", async () => {
    await waiting();
    vi.stubEnv("WORKER_KEY", "");
    expect((await asWorker("/worker/work", { reader: "first", worker: "vm", limit: 1 }, "")).status).toBe(404);
    vi.stubEnv("WORKER_KEY", "short");
    expect((await asWorker("/worker/work", { reader: "first", worker: "vm", limit: 1 }, "short")).status).toBe(404);
  });
});

describe("give me work", () => {
  it("hands out a sentence as its line id, words' hash and the exact request for each question: never who wrote it", async () => {
    const { line, sentence } = await waiting();
    const res = await asWorker("/worker/work", { reader: "first", worker: "vm", limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.work).toHaveLength(1);
    const [item] = res.body.work;
    expect(fieldsOf(item)).toEqual(["asks", "line", "showHash"]);
    expect(item.line).toBe(String(line._id));
    expect(item.asks).toHaveLength(1);
    const [ask] = item.asks;
    expect(ask.question).toBe("welfare");
    expect(ask.version).toBe(WELFARE);
    expect(ask.request.temperature).toBe(0);
    expect(ask.request.messages[0]).toEqual({ role: "system", content: WELFARE_INSTRUCTIONS });
    expect(JSON.parse(ask.request.messages[1].content)).toEqual({ tell: sentence.tell, show: "Clothes carpeted the floor." });
    // No model name: the worker adds its own
    expect(ask.request.model).toBeUndefined();
    expect(JSON.stringify(item)).not.toMatch(/Ada|Lovelace|example\.com|google-/);
  });

  it("never hands out an explicit worrying phrase", async () => {
    const { line } = await waiting("I want to die.");
    const res = await asWorker("/worker/work", { reader: "first", worker: "vm", limit: 5 });
    expect(res.body.work).toEqual([]);
    expect((await ReviewLine.findById(line._id))?.needs).toHaveLength(0);
  });

  it("never hands out words that have changed since they got in line", async () => {
    const { sentence, line } = await waiting();
    await Sentence.updateOne({ _id: sentence._id }, { $set: { show: "Clothes covered the floor." } });
    expect((await asWorker("/worker/work", { reader: "first", worker: "vm", limit: 5 })).body.work).toEqual([]);
    expect((await ReviewLine.findById(line._id))?.state).toBe("replaced");
  });

  it("never gives two workers asking at once the same sentence", async () => {
    for (let i = 0; i < 4; i++) await waiting(`Clothes carpeted the floor ${i}.`);
    const [a, b] = await Promise.all([
      asWorker("/worker/work", { reader: "first", worker: "vm-a", limit: 4 }),
      asWorker("/worker/work", { reader: "first", worker: "vm-b", limit: 4 }),
    ]);
    const lines = [...a.body.work, ...b.body.work].map((w: { line: string }) => w.line);
    expect(lines).toHaveLength(4);
    expect(new Set(lines).size).toBe(4);
  });

  it("refuses the hosted model as a reader, and a request in any other form", async () => {
    expect((await asWorker("/worker/work", { reader: "hosted", worker: "vm", limit: 1 })).status).toBe(400);
    expect((await asWorker("/worker/work", { reader: "first", worker: "vm", limit: 1000 })).status).toBe(400);
    expect((await asWorker("/worker/work", { reader: "first", worker: "vm", limit: 1, extra: 1 })).status).toBe(400);
  });
});

describe("here are answers", () => {
  const welfare = (line: { _id: unknown }, more: object = {}) => ({
    line: String(line._id),
    showHash: hashShow("Clothes carpeted the floor."),
    reader: "first",
    question: "welfare",
    model: GEMMA,
    questionVersion: WELFARE,
    raw: '{"concern":"no"}',
    ...more,
  });

  it("counts the same answer posted twice once", async () => {
    const { line } = await waiting();
    const first = await asWorker("/worker/answers", { answers: [welfare(line)] });
    const again = await asWorker("/worker/answers", { answers: [welfare(line)] });
    expect(first.body.results[0].result).toBe("saved");
    expect(again.body.results[0].result).toBe("duplicate");
    expect((await ReviewLine.findById(line._id))?.answers).toHaveLength(1);
  });

  it("refuses an answer for words that have since changed", async () => {
    const { sentence, line } = await waiting();
    await enterLine(sentence._id, "Clothes covered the floor.");
    const res = await asWorker("/worker/answers", { answers: [welfare(line)] });
    expect(res.body.results[0].result).toBe("stale");
  });

  it("reads the model's reply strictly: anything not in the exact form is a failed try, never an answer", async () => {
    const { line } = await waiting();
    const res = await asWorker("/worker/answers", {
      answers: [
        welfare(line, { raw: "maybe" }),
        welfare(line, { raw: '{"concern":"no","why":"fine"}' }),
        welfare(line, { question: "checklist", questionVersion: questionVersion("checklist"), raw: '{"suitable":"yes"}' }),
      ],
    });
    expect(res.body.results.map((r: { result: string }) => r.result)).toEqual(["invalid", "invalid", "invalid"]);
    const stored = await ReviewLine.findById(line._id);
    expect(stored?.answers).toHaveLength(0);
    expect(stored?.failedTries?.first).toBe(3);
  });

  it("saves the answer itself, not the raw reply", async () => {
    const { line } = await waiting();
    await asWorker("/worker/answers", { answers: [welfare(line, { raw: '{"concern":"yes"}' })] });
    expect((await ReviewLine.findById(line._id))?.answers.map((a) => a.answer)).toEqual(["yes"]);
  });

  it("reads Llama Guard's reply as safe or unsafe", async () => {
    const { line } = await waiting();
    const safety = { reader: "safety", question: "safety", questionVersion: questionVersion("safety"), model: "llama-guard3:8b@x" };
    await asWorker("/worker/answers", { answers: [welfare(line, { ...safety, raw: "unsafe\nS1" })] });
    expect((await ReviewLine.findById(line._id))?.answers.map((a) => a.answer)).toEqual(["unsafe"]);
  });

  it("doesn't count an answer to an older version of the question", async () => {
    const { line } = await waiting();
    const res = await asWorker("/worker/answers", { answers: [welfare(line, { questionVersion: "0123456789abcdef" })] });
    expect(res.body.results[0].result).toBe("stale");
  });

  it("counts a failure against that reader", async () => {
    const { line } = await waiting();
    await asWorker("/worker/answers", { failures: [{ line: String(line._id), reader: "first" }] });
    expect((await ReviewLine.findById(line._id))?.failedTries?.first).toBe(1);
  });

  it("refuses answers from the hosted model: the backend asks it itself", async () => {
    const { line } = await waiting();
    expect((await asWorker("/worker/answers", { answers: [welfare(line, { reader: "hosted" })] })).status).toBe(400);
  });
});
