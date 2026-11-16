import { afterEach, describe, expect, it, vi } from "vitest";
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

  // The deploy workflows build passes with openssl, not this code. This is
  // the pass openssl gives for this key and expiry:
  //   printf 'v1.4102444800' | openssl dgst -sha256 -hmac "$KEY" -hex
  it("matches what the workflows' openssl command produces", () => {
    expect(mintTestPass(KEY, 4102444800)).toBe(
      "v1.4102444800.3019b6ded75415c650d47d09918cd92d73ab0abd0bc8d6249adaf9d87429b541"
    );
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
