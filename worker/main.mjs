// Starts Scribbles' worker. Settings come from the environment (see
// README.md): the key from a file only its own user can read.
import { readFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { createWorker, runForever } from "./worker.mjs";

const env = process.env;
const need = (name) => {
  if (!env[name]) {
    console.error(`Set ${name} (see README.md).`);
    process.exit(1);
  }
  return env[name];
};

const key = readFileSync(need("WORKER_KEY_FILE"), "utf8").trim();
if (!/^[A-Za-z0-9_-]{32,200}$/.test(key)) {
  console.error("The key file must hold one key of 32 to 200 letters, digits, _ or -.");
  process.exit(1);
}
const backend = need("BACKEND_URL");
if (!/^https:\/\//.test(backend) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(backend)) {
  console.error("BACKEND_URL must start with https:// (the key must never travel unencrypted).");
  process.exit(1);
}

// Ids and outcomes only, never a child's words
const log = (entry) => console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));

let stopping = false;
const controller = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stopping = true;
    controller.abort();
    log({ event: "stopping" });
  });
}

const worker = createWorker({
  backend,
  key,
  name: env.WORKER_NAME || "vm",
  ollama: env.OLLAMA_URL || "http://127.0.0.1:11434",
  models: {
    safety: env.SAFETY_MODEL || "llama-guard3:8b",
    first: env.FIRST_MODEL || "gemma4:e4b",
    second: env.SECOND_MODEL || "qwen3.5:9b",
  },
  log,
});

log({ event: "started" });
await runForever(worker, {
  shouldStop: () => stopping,
  sleep: (ms) => wait(ms, undefined, { signal: controller.signal }).catch(() => {}),
  log,
});
log({ event: "stopped" });
