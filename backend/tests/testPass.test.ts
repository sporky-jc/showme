import { afterEach, describe, expect, it, vi } from "vitest";
import { execFile, execFileSync } from "node:child_process";
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

  // The passes QA Wolf gets are made by .github/scripts/test-login-pass.mjs,
  // not by this code: run it, and check its pass is one the backend takes
  it("accepts the passes the workflows' script makes", () => {
    const dir = mkdtempSync(join(tmpdir(), "test-pass-"));
    const output = join(dir, "github_output");
    writeFileSync(output, "");
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("../../.github/scripts/test-login-pass.mjs", import.meta.url)), "output"],
      { env: { PATH: process.env.PATH, TEST_LOGIN_KEY: KEY, GITHUB_OUTPUT: output } }
    );
    const line = readFileSync(output, "utf8").trim();
    const pass = JSON.parse(line.slice("variables=".length)).TEST_LOGIN_SECRET;

    expect(isValidTestPass(pass, KEY)).toBe(true);
    expect(isValidTestPass(pass, OTHER_KEY)).toBe(false);
  });

  // Runs the script's output mode and returns the variables it hands QA Wolf
  const outputVariables = (env: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "test-pass-"));
    const output = join(dir, "github_output");
    writeFileSync(output, "");
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("../../.github/scripts/test-login-pass.mjs", import.meta.url)), "output"],
      { env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, ...env } }
    );
    const line = readFileSync(output, "utf8").trim();
    return JSON.parse(line.slice("variables=".length));
  };

  it("sends the preview's address with the pass, for flows that check it", () => {
    const url = "https://deploy-preview-7--show-me-not-tell.netlify.app";
    const variables = outputVariables({ TEST_LOGIN_KEY: KEY, APPROVED_PREVIEW_URL: url });
    expect(variables.TEST_LOGIN_APPROVED_PREVIEW_URL).toBe(url);
    expect(isValidTestPass(variables.TEST_LOGIN_SECRET, KEY)).toBe(true);
  });

  it("still sends the preview's address when there is no key", () => {
    const url = "https://deploy-preview-7--show-me-not-tell.netlify.app";
    expect(outputVariables({ APPROVED_PREVIEW_URL: url })).toEqual({
      TEST_LOGIN_APPROVED_PREVIEW_URL: url,
    });
  });

  it("sends no address when none is given", () => {
    expect(outputVariables({})).toEqual({});
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
    vi.stubEnv("TEST_LOGIN_SECRET", "");
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    const res = await login(mintTestPass(KEY, inAnHour()));

    expect(res.status).toBe(200);
  });

  it("refuses an expired pass (401)", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", KEY);
    vi.stubEnv("TEST_LOGIN_SECRET", "");
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    const res = await login(mintTestPass(KEY, now() - 1));

    expect(res.status).toBe(401);
  });

  it("refuses the key itself: only signed passes open the door", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", KEY);
    vi.stubEnv("TEST_LOGIN_SECRET", "");
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    expect((await login(KEY)).status).toBe(401);
  });

  it("still takes the fixed secret while it is set, so the switch has no gap", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", KEY);
    vi.stubEnv("TEST_LOGIN_SECRET", SECRET);
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    expect((await login(SECRET)).status).toBe(200);
    expect((await login(mintTestPass(KEY, inAnHour()))).status).toBe(200);
  });

  it("refuses the old fixed secret once it is unset", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", KEY);
    vi.stubEnv("TEST_LOGIN_SECRET", "");
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    expect((await login(SECRET)).status).toBe(401);
  });

  it("stays shut on production, even with a key and a valid pass", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", KEY);
    vi.stubEnv("GCLOUD_PROJECT", "showme-backend-789");

    expect((await login(mintTestPass(KEY, inAnHour()))).status).toBe(404);
  });

  it("stays shut when the key is too short to be safe", async () => {
    vi.stubEnv("TEST_LOGIN_KEY", "short");
    vi.stubEnv("TEST_LOGIN_SECRET", "");
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    expect((await login(mintTestPass("short", inAnHour()))).status).toBe(404);
  });
});
