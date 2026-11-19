import { afterEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import app from "../app.js";
import {
  isValidTestPass,
  MAX_PASS_SECONDS,
  mintTestPass,
} from "../utils/testPass.js";

// Short-lived passes for the staging test login (utils/testPass.ts)

const KEY = "k".repeat(64);
const OTHER_KEY = "o".repeat(64);
const SECRET = "a-long-random-test-login-secret-0123456789";
const now = () => Math.floor(Date.now() / 1000);
const inAnHour = () => now() + 60 * 60;

describe("isValidTestPass", () => {
  it("accepts a pass signed with the key that hasn't expired", () => {
    expect(isValidTestPass(mintTestPass(KEY, inAnHour()), KEY)).toBe(true);
  });

  it("refuses an expired pass", () => {
    expect(isValidTestPass(mintTestPass(KEY, now() - 1), KEY)).toBe(false);
  });

  it("refuses a pass signed with another key", () => {
    expect(isValidTestPass(mintTestPass(OTHER_KEY, inAnHour()), KEY)).toBe(false);
  });

  it("refuses a pass whose expiry was pushed back after signing", () => {
    const pass = mintTestPass(KEY, inAnHour());
    const [, , signature] = pass.split(".");
    expect(isValidTestPass(`v1.${inAnHour() + 60}.${signature}`, KEY)).toBe(false);
  });

  // The pass saved in QA Wolf lasts a day, because GitHub runs the hourly
  // refresh only every few hours
  it("accepts a pass that lasts 24 hours", () => {
    expect(isValidTestPass(mintTestPass(KEY, now() + 24 * 60 * 60), KEY)).toBe(true);
  });

  it(`refuses a pass that claims to last more than ${MAX_PASS_SECONDS / 3600} hours`, () => {
    const tooLong = now() + MAX_PASS_SECONDS + 60;
    expect(isValidTestPass(mintTestPass(KEY, tooLong), KEY)).toBe(false);
  });

  it.each(["", "v1", "v1.123", "v2.9999999999.ab", `v1.abc.${"0".repeat(64)}`])(
    "refuses a malformed pass %j",
    (pass) => {
      expect(isValidTestPass(pass, KEY)).toBe(false);
    }
  );

  it("refuses a second spelling of a pass (a leading zero in the expiry)", () => {
    const pass = mintTestPass(KEY, inAnHour());
    expect(isValidTestPass(pass.replace("v1.", "v1.0"), KEY)).toBe(false);
  });
});

const SCRIPT = fileURLToPath(new URL("../../.github/scripts/test-login-pass.mjs", import.meta.url));

// A stand-in for QA Wolf's API: answers environment.find with `environments`
// (or `findStatus`) and records every request
const standInQaWolf = async ({
  environments = [] as object[],
  // Further pages of environments, served one per nextCursor
  morePages = [] as object[][],
  // Answers to give environment.find before the real one (e.g. [503])
  findStatus = 200,
  failFirst = [] as number[],
} = {}) => {
  let finds = 0;
  const received: { method?: string; url?: string; auth?: string; body?: string }[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      if (req.url?.startsWith("/api/trpc/public.environment.find")) {
        const attempt = finds++;
        if (attempt < failFirst.length) {
          res.writeHead(failFirst[attempt]);
          res.end("unavailable");
          return;
        }
        const input = JSON.parse(new URL(req.url, "http://x").searchParams.get("input") ?? "{}").json;
        const page = input.cursor ? Number(input.cursor) : 0;
        const pages = [environments, ...morePages];
        const nextCursor = page + 1 < pages.length ? String(page + 1) : undefined;
        res.writeHead(findStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ result: { data: { json: { environments: pages[page], nextCursor } } } }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"result":{"data":{"json":{}}}}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { received, host: `http://127.0.0.1:${port}`, close: () => server.close() };
};

const PREVIEW = "https://deploy-preview-7--show-me-not-tell.netlify.app";

// Runs the script's pr mode; returns what it sent QA Wolf and the variables
// it hands the deployment
const runPr = async (qawolf: Awaited<ReturnType<typeof standInQaWolf>>, env: Record<string, string> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "test-pass-"));
  const output = join(dir, "github_output");
  writeFileSync(output, "");
  try {
    await promisify(execFile)(process.execPath, [SCRIPT, "pr"], {
      env: {
        PATH: process.env.PATH,
        GITHUB_OUTPUT: output,
        TEST_LOGIN_KEY: KEY,
        QAWOLF_API_KEY: "qawolf-api-key",
        QAWOLF_HOST_URL: qawolf.host,
        PR_ENVIRONMENT_NAME: "sporky-jc-showme-pr-7",
        APPROVED_PREVIEW_URL: PREVIEW,
        ...env,
      },
    });
  } finally {
    qawolf.close();
  }
  const line = readFileSync(output, "utf8").trim();
  const saves = qawolf.received
    .filter((r) => r.url === "/api/trpc/public.environment.setVariable")
    .map((r) => JSON.parse(r.body ?? "{}").json);
  return { saves, variables: line ? JSON.parse(line.slice("variables=".length)) : undefined };
};

describe("the workflows' script, for a pull request preview", () => {
  it("saves a pass the backend accepts in the pull request's own QA Wolf environment", async () => {
    const qawolf = await standInQaWolf({
      environments: [
        { id: "old-pr-7", name: "Sporky-jc-showme-pr-7", terminatedAt: "2026-01-01T00:00:00Z" },
        { id: "pr-8", name: "Sporky-jc-showme-pr-8" },
        { id: "pr-7", name: "Sporky-jc-showme-pr-7" },
      ],
    });
    const { saves } = await runPr(qawolf);

    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ environmentId: "pr-7", name: "TEST_LOGIN_SECRET" });
    expect(isValidTestPass(saves[0].value, KEY)).toBe(true);
    expect(isValidTestPass(saves[0].value, OTHER_KEY)).toBe(false);
    const find = qawolf.received.find((r) => r.method === "GET");
    expect(find?.auth).toBe("Bearer qawolf-api-key");
  });

  it("saves it in staging, which the environment is copied from, when QA Wolf hasn't made one yet", async () => {
    const { saves } = await runPr(await standInQaWolf({ environments: [{ id: "pr-8", name: "Sporky-jc-showme-pr-8" }] }));

    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ environmentId: "staging", name: "TEST_LOGIN_SECRET" });
  });

  // QA Wolf shows a deployment's variables in its pull request comment
  it("hands the deployment only the preview's address, never the pass", async () => {
    const { variables } = await runPr(await standInQaWolf());

    expect(variables).toEqual({ TEST_LOGIN_APPROVED_PREVIEW_URL: PREVIEW });
  });

  it("finds the environment on a later page", async () => {
    const { saves } = await runPr(
      await standInQaWolf({
        environments: [{ id: "pr-9", name: "Sporky-jc-showme-pr-9" }],
        morePages: [[{ id: "pr-7", name: "Sporky-jc-showme-pr-7" }]],
      })
    );

    expect(saves.map((save) => save.environmentId)).toEqual(["pr-7"]);
  });

  it("tries the lookup again when QA Wolf has a hiccup", async () => {
    const { saves } = await runPr(
      await standInQaWolf({
        environments: [{ id: "pr-7", name: "Sporky-jc-showme-pr-7" }],
        failFirst: [503],
      })
    );

    expect(saves.map((save) => save.environmentId)).toEqual(["pr-7"]);
  }, 20_000);

  it("hands the deployment nothing when no preview address is given", async () => {
    const { variables } = await runPr(await standInQaWolf(), { APPROVED_PREVIEW_URL: "" });

    expect(variables).toEqual({});
  });

  it("fails, sending nothing, without a key", async () => {
    const qawolf = await standInQaWolf();
    await expect(runPr(qawolf, { TEST_LOGIN_KEY: "" })).rejects.toThrow();
    expect(qawolf.received).toHaveLength(0);
  });

  it("fails without saving when QA Wolf refuses the lookup", async () => {
    const qawolf = await standInQaWolf({ findStatus: 403 });
    await expect(runPr(qawolf)).rejects.toThrow();
    expect(qawolf.received.filter((r) => r.method === "POST")).toHaveLength(0);
  });
});

describe("the workflows' script, saving a pass in QA Wolf", () => {
  // Runs the script's save mode against a stand-in for QA Wolf's API and
  // returns the request it sent
  it("saves a 24-hour pass the backend accepts", async () => {
    const received: { url?: string; auth?: string; body?: string }[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ url: req.url, auth: req.headers.authorization, body });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"result":{"data":{"json":{}}}}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      await promisify(execFile)(
        process.execPath,
        [fileURLToPath(new URL("../../.github/scripts/test-login-pass.mjs", import.meta.url)), "save"],
        {
          env: {
            PATH: process.env.PATH,
            TEST_LOGIN_KEY: KEY,
            QAWOLF_API_KEY: "qawolf-api-key",
            QAWOLF_HOST_URL: `http://127.0.0.1:${port}`,
          },
        }
      );
    } finally {
      server.close();
    }

    expect(received).toHaveLength(1);
    expect(received[0].url).toBe("/api/trpc/public.environment.setVariable");
    expect(received[0].auth).toBe("Bearer qawolf-api-key");
    const { json } = JSON.parse(received[0].body ?? "{}");
    expect(json).toMatchObject({ environmentId: "staging", name: "TEST_LOGIN_SECRET" });
    expect(isValidTestPass(json.value, KEY)).toBe(true);
    const hours = (Number(json.value.split(".")[1]) - now()) / 3600;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });
});

describe("the test login with passes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const login = (secret: string) =>
    request(app).post("/auth/test").send({ secret, role: "student" });

  it("lets a valid pass in when TEST_LOGIN_KEY is set", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", KEY);
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    const res = await login(mintTestPass(KEY, inAnHour()));

    expect(res.status).toBe(200);
  });

  it("refuses an expired pass (401)", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", KEY);
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    const res = await login(mintTestPass(KEY, now() - 1));

    expect(res.status).toBe(401);
  });

  it("refuses the key itself: only signed passes open the door", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", KEY);
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    expect((await login(KEY)).status).toBe(401);
  });

  it("refuses the old fixed secret, even if TEST_LOGIN_SECRET is still set", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", KEY);
    vi.stubEnv("TEST_LOGIN_SECRET", SECRET);
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    expect((await login(SECRET)).status).toBe(401);
    expect((await login(mintTestPass(KEY, inAnHour()))).status).toBe(200);
  });

  it("doesn't exist with only the old fixed secret set and no key", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", "");
    vi.stubEnv("TEST_LOGIN_SECRET", SECRET);
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    expect((await login(SECRET)).status).toBe(404);
  });

  it("stays shut on production, even with a key and a valid pass", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", KEY);
    vi.stubEnv("GCLOUD_PROJECT", "showme-backend-789");

    expect((await login(mintTestPass(KEY, inAnHour()))).status).toBe(404);
  });

  it("stays shut when the key is too short to be safe", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", "short");
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    expect((await login(mintTestPass("short", inAnHour()))).status).toBe(404);
  });
});
