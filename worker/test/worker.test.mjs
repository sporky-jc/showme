// The worker against a fake backend and fake models (tasks/scribbles-worker-spec.md,
// T10): no network, no model, no VM. Made-up sentences only.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BackendError, IDLE_MS, MAX_BACKOFF_MS, backoff, createWorker, runForever } from "../worker.mjs";

const KEY = "k".repeat(40);
const HASH = "a".repeat(64);
const ask = (question) => ({
  question,
  version: `v-${question}`,
  request: { temperature: 0, messages: [{ role: "user", content: "{made-up sentence}" }] },
});
const item = (line, questions = ["welfare"]) => ({ line, showHash: HASH, asks: questions.map(ask) });

// A fake backend and a fake Ollama in one fetch. `work` is what each reader
// gets, batch by batch; `reply(model, body)` is what the model says (a
// string, or "timeout", "error" or a thrown error).
const fake = ({ work = {}, reply = () => '{"concern":"no"}', tags = ["llama-guard3:8b", "gemma4:e4b", "qwen3.5:9b"], backendDown = false } = {}) => {
  const calls = { posted: [], asked: [], workAsks: [], auth: [] };
  const queues = Object.fromEntries(Object.entries(work).map(([reader, batches]) => [reader, [...batches]]));
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const fetch = async (url, init = {}) => {
    if (new URL(url).origin === "https://backend.test") {
      if (backendDown) throw new TypeError("fetch failed");
      calls.auth.push(init.headers?.authorization);
      const body = JSON.parse(init.body);
      if (url.endsWith("/worker/work")) {
        calls.workAsks.push(body);
        return json({ work: queues[body.reader]?.shift() ?? [] });
      }
      if (url.endsWith("/worker/answers")) {
        calls.posted.push(body);
        return json({ results: body.answers.map(() => ({ result: "saved" })) });
      }
    }
    if (url.endsWith("/api/tags")) return json({ models: tags.map((name) => ({ name, digest: `${name.length}`.padStart(12, "0") + "ffff" })) });
    if (url.endsWith("/v1/chat/completions")) {
      const body = JSON.parse(init.body);
      calls.asked.push(body);
      const said = reply(body.model, body);
      if (said === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      if (said === "error") return json({ error: "model failed" }, 500);
      return json({ choices: [{ message: { content: said } }] });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { fetch, calls };
};

const worker = (f, logs = []) =>
  createWorker({
    backend: "https://backend.test",
    key: KEY,
    name: "vm",
    ollama: "http://127.0.0.1:11434",
    models: { safety: "llama-guard3:8b", first: "gemma4:e4b", second: "qwen3.5:9b" },
    fetch: f.fetch,
    log: (entry) => logs.push(entry),
  });

describe("reading", () => {
  it("runs one reader over everything waiting, then the next, and posts each model's raw reply", async () => {
    const f = fake({ work: { first: [[item("L1"), item("L2")]], second: [[item("L1", ["checklist"])]] } });
    const done = await worker(f).runOnce();
    assert.equal(done, 3);
    // Every first-model call before any second-model call: one model loaded at a time
    const models = f.calls.asked.map((a) => a.model);
    assert.deepEqual(models, ["gemma4:e4b", "gemma4:e4b", "qwen3.5:9b"]);
    assert.deepEqual(f.calls.posted[0].answers[0], {
      line: "L1",
      showHash: HASH,
      reader: "first",
      question: "welfare",
      model: "gemma4:e4b@" + "0000000000" + "10",
      questionVersion: "v-welfare",
      raw: '{"concern":"no"}',
    });
    assert.deepEqual(f.calls.posted[0].failures, []);
  });

  it("sends the backend's request as it came, adding only the model's name", async () => {
    const f = fake({ work: { first: [[item("L1")]] } });
    await worker(f).runOnce();
    assert.deepEqual(f.calls.asked[0], { ...ask("welfare").request, model: "gemma4:e4b" });
  });

  it("sends its key, and asks for at most a batch at a time", async () => {
    const f = fake({ work: { first: [[item("L1")]] } });
    await worker(f).runOnce();
    assert.ok(f.calls.auth.every((a) => a === `Bearer ${KEY}`));
    assert.ok(f.calls.workAsks.every((w) => w.limit === 10 && w.worker === "vm"));
  });

  it("posts nonsense from a model as it came: the backend reads it strictly", async () => {
    const f = fake({ work: { first: [[item("L1")]] }, reply: () => "I think it's fine!" });
    await worker(f).runOnce();
    assert.equal(f.calls.posted[0].answers[0].raw, "I think it's fine!");
  });

  it("logs ids and outcomes only, never a sentence's words", async () => {
    const logs = [];
    const f = fake({ work: { first: [[item("L1")]] } });
    await worker(f, logs).runOnce();
    assert.ok(!JSON.stringify(logs).includes("made-up sentence"));
    assert.ok(logs.some((l) => l.event === "posted" && l.line === "L1"));
  });
});

describe("when a model fails", () => {
  it("counts a time-out as a failed try once the model has answered another sentence", async () => {
    let n = 0;
    const f = fake({ work: { first: [[item("L1"), item("L2")]] }, reply: () => (n++ === 0 ? '{"concern":"no"}' : "timeout") });
    await worker(f).runOnce();
    assert.deepEqual(f.calls.posted[1], { answers: [], failures: [{ line: "L2", reader: "first" }] });
  });

  it("blames no sentence when the model hasn't answered anything yet: it's down", async () => {
    const logs = [];
    const f = fake({ work: { first: [[item("L1"), item("L2")]] }, reply: (model) => (model === "gemma4:e4b" ? "error" : '{"concern":"no"}') });
    await worker(f, logs).runOnce();
    assert.equal(f.calls.posted.filter((p) => p.failures.length > 0).length, 0);
    assert.ok(logs.some((l) => l.event === "model-not-answering" && l.reader === "first"));
  });

  it("skips a model that isn't there, without asking for its work", async () => {
    const logs = [];
    const f = fake({ work: { second: [[item("L1")]] }, tags: ["llama-guard3:8b", "gemma4:e4b"] });
    await worker(f, logs).runOnce();
    assert.ok(!f.calls.workAsks.some((w) => w.reader === "second"));
    assert.ok(logs.some((l) => l.event === "model-missing" && l.reader === "second"));
  });
});

describe("when the backend is away, or the worker is stopped", () => {
  it("throws a backend error, and waits longer after each failure in a row, up to 10 minutes", async () => {
    const f = fake({ backendDown: true });
    await assert.rejects(worker(f).runOnce(), BackendError);
    assert.equal(backoff(1), IDLE_MS);
    assert.equal(backoff(2), IDLE_MS * 2);
    assert.equal(backoff(20), MAX_BACKOFF_MS);
  });

  it("carries on by itself once the backend is back", async () => {
    let down = true;
    const f = fake({ work: { first: [[item("L1")]] } });
    const flaky = async (url, init) => {
      if (new URL(url).origin === "https://backend.test" && down) throw new TypeError("fetch failed");
      return f.fetch(url, init);
    };
    const waits = [];
    let passes = 0;
    await runForever(worker({ fetch: flaky }), {
      shouldStop: () => passes >= 3,
      sleep: async (ms) => {
        waits.push(ms);
        passes++;
        down = false;
      },
    });
    assert.equal(waits[0], IDLE_MS); // after the failure
    assert.equal(f.calls.posted.length, 1); // then the work was done
  });

  it("stops between sentences when told to: what it didn't finish is left for its claims to run out", async () => {
    let stop = false;
    const f = fake({ work: { first: [[item("L1"), item("L2"), item("L3")]] }, reply: () => { stop = true; return '{"concern":"no"}'; } });
    const done = await worker(f).runOnce(() => stop);
    assert.equal(done, 1);
    assert.equal(f.calls.posted.length, 1);
  });
});
