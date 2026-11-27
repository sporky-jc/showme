// Scribbles' worker (tasks/scribbles-worker-spec.md, T10). It runs on the
// owner's VM, next to Ollama, and only ever connects out: it asks the
// backend for work, sends each request to the local model as it came, and
// posts the model's raw reply back. Nothing connects in to it.
//
// It writes no prompt and reads no answer: the backend sends the exact
// request for each question and checks every reply strictly
// (backend/reviewer/asks.ts). It never learns who wrote a sentence. Its
// logs hold ids and outcomes only, never a child's words.
//
// One model at a time: it runs one reader over everything waiting, then
// the next, so the VM only ever has one model loaded.
//
// When something fails:
// - a model that times out or errors on a sentence: that's a failed try
//   for the sentence, but only once the model has answered another
//   sentence in this run, so an outage is never blamed on a sentence;
// - a model that isn't there, or hasn't answered anything yet: its work is
//   left for its claims to run out (15 minutes), and it's tried again later;
// - the backend away: the worker waits longer after each failure.

export const READERS = ["safety", "first", "second"];
export const BATCH = 10;
export const MODEL_TIMEOUT_MS = 120_000;
export const BACKEND_TIMEOUT_MS = 30_000;
export const IDLE_MS = 30_000;
export const MAX_BACKOFF_MS = 10 * 60_000;

export class BackendError extends Error {}

// How long to wait after this many failures in a row: 30 s, doubling, at
// most 10 minutes
export const backoff = (failures) => Math.min(MAX_BACKOFF_MS, IDLE_MS * 2 ** Math.max(0, failures - 1));

export const createWorker = ({ backend, key, name, ollama, models, fetch = globalThis.fetch, log = () => {} }) => {
  const backendCall = async (path, body) => {
    let res;
    try {
      res = await fetch(`${backend.replace(/\/+$/, "")}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      });
    } catch (error) {
      throw new BackendError(`backend unreachable: ${error?.name ?? "error"}`);
    }
    if (!res.ok) throw new BackendError(`backend answered ${res.status}`);
    return res.json();
  };

  // The model's exact version, from Ollama ("gemma4:e4b@1a2b3c4d5e6f"), or
  // null when it isn't there
  const modelVersion = async (model) => {
    try {
      const res = await fetch(`${ollama.replace(/\/+$/, "")}/api/tags`, { signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS) });
      if (!res.ok) return null;
      const { models: found = [] } = await res.json();
      const entry = found.find((m) => m.name === model || m.model === model);
      return entry ? `${model}@${String(entry.digest ?? "").slice(0, 12)}` : null;
    } catch {
      return null;
    }
  };

  // One request to the model, as the backend built it, with the model's
  // name added: its reply as text, or null when it failed or timed out
  const ask = async (model, request) => {
    try {
      const res = await fetch(`${ollama.replace(/\/+$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, model }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const content = (await res.json())?.choices?.[0]?.message?.content;
      return typeof content === "string" ? content : null;
    } catch {
      return null;
    }
  };

  // Everything waiting for one reader, batch by batch. Returns how many
  // sentences it posted answers for.
  const runReader = async (reader, shouldStop) => {
    const model = models[reader];
    if (!model) return 0;
    const version = await modelVersion(model);
    if (!version) {
      log({ event: "model-missing", reader });
      return 0;
    }
    let answeredThisRun = false;
    let done = 0;
    while (!shouldStop()) {
      const { work = [] } = await backendCall("/worker/work", { reader, worker: name, limit: BATCH });
      if (work.length === 0) break;
      for (const item of work) {
        if (shouldStop()) return done;
        const answers = [];
        let failed = false;
        for (const { question, version: questionVersion, request } of item.asks) {
          const raw = await ask(model, request);
          if (raw === null) {
            failed = true;
            break;
          }
          answeredThisRun = true;
          answers.push({ line: item.line, showHash: item.showHash, reader, question, model: version, questionVersion, raw });
        }
        if (failed && !answeredThisRun) {
          // The model hasn't answered anything yet: it's down, not this
          // sentence's fault. Its claims run out and it's tried later.
          log({ event: "model-not-answering", reader });
          return done;
        }
        const failures = failed ? [{ line: item.line, reader }] : [];
        const { results = [] } = await backendCall("/worker/answers", { answers, failures });
        log({ event: "posted", reader, line: item.line, results: results.map((r) => r.result), failed });
        done++;
      }
    }
    return done;
  };

  // One pass over every reader; how many sentences got answers
  const runOnce = async (shouldStop = () => false) => {
    let done = 0;
    for (const reader of READERS) {
      if (shouldStop()) break;
      done += await runReader(reader, shouldStop);
    }
    return done;
  };

  return { runOnce, runReader, modelVersion };
};

// Runs until stopped: a pass, then a short rest when there was nothing to
// do, or a longer one after each failure in a row
export const runForever = async (worker, { shouldStop, sleep, log = () => {} }) => {
  let failures = 0;
  while (!shouldStop()) {
    try {
      const done = await worker.runOnce(shouldStop);
      failures = 0;
      if (done === 0) await sleep(IDLE_MS);
    } catch (error) {
      failures++;
      const wait = backoff(failures);
      log({ event: "backend-error", message: error instanceof BackendError ? error.message : "error", waitMs: wait });
      await sleep(wait);
    }
  }
};
