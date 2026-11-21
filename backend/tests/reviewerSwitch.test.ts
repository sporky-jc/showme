import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { ReviewerSwitch } from "../models/reviewerSwitch.js";
import { REVIEWER_SWITCH_REQUESTS_PER_MINUTE } from "../middlewares/rateLimit.js";
import { createAdmin, createUser, fieldsOf, sessionCookie } from "./helpers.js";

// GET and PATCH /Admin/reviewer: the Teacher page's off switch for
// Scribbles, which pauses the scheduled reviewer at once, with no deploy.
// (That the reviewer then does nothing is in reviewerQueue.test.ts.)

const statusFor = (user: { id: string }) =>
  request(app).get("/Admin/reviewer").set("Cookie", sessionCookie(user));
const switchFor = (user: { id: string }, body: unknown) =>
  request(app).patch("/Admin/reviewer").set("Cookie", sessionCookie(user)).send(body as object);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /Admin/reviewer", () => {
  it("needs a login", async () => {
    expect((await request(app).get("/Admin/reviewer")).status).toBe(401);
  });

  it("is for admins only", async () => {
    const res = await statusFor(await createUser());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. Admins only." });
  });

  it("says the deploy's mode, and that Scribbles isn't paused when nobody ever paused him", async () => {
    vi.stubEnv("REVIEWER_MODE", "suggest");

    const res = await statusFor(await createAdmin());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mode: "suggest", paused: false });
  });

  it("says off when the deploy didn't turn Scribbles on", async () => {
    vi.stubEnv("REVIEWER_MODE", "");

    expect((await statusFor(await createAdmin())).body).toEqual({ mode: "off", paused: false });
  });

  it("lets the test admin look", async () => {
    const testAdmin = await createAdmin({ id: "test-admin", email: "test-admin@showme.test" });

    expect((await statusFor(testAdmin)).status).toBe(200);
  });
});

describe("PATCH /Admin/reviewer", () => {
  it("needs a login", async () => {
    expect((await request(app).patch("/Admin/reviewer").send({ paused: true })).status).toBe(401);
    expect(await ReviewerSwitch.countDocuments()).toBe(0);
  });

  it("is for admins only", async () => {
    const res = await switchFor(await createUser(), { paused: true });

    expect(res.status).toBe(403);
    expect(await ReviewerSwitch.countDocuments()).toBe(0);
  });

  // The switch is one for the whole site, while the test admin only ever
  // sees test accounts' sentences: a browser test mustn't stop Scribbles for
  // real teachers
  it("refuses the test admin, and changes nothing", async () => {
    const testAdmin = await createAdmin({ id: "test-admin", email: "test-admin@showme.test" });

    const res = await switchFor(testAdmin, { paused: true });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Test accounts can't pause Scribbles." });
    expect((await statusFor(testAdmin)).body).toMatchObject({ paused: false });
  });

  it("pauses Scribbles, and turns him back on, and each one stays", async () => {
    vi.stubEnv("REVIEWER_MODE", "suggest");
    const admin = await createAdmin();
    const other = await createAdmin({ id: "google-admin-2", email: "other@example.com" });

    const paused = await switchFor(admin, { paused: true });
    expect(paused.status).toBe(200);
    expect(fieldsOf(paused.body)).toEqual(["mode", "paused", "pausedAt"]);
    expect(paused.body).toMatchObject({ mode: "suggest", paused: true });
    expect(Date.now() - new Date(paused.body.pausedAt).getTime()).toBeLessThan(60_000);
    // Every teacher sees it: it's one switch for the site
    expect((await statusFor(other)).body).toEqual(paused.body);

    // Pausing again keeps the time it was first paused
    expect((await switchFor(other, { paused: true })).body).toEqual(paused.body);

    const on = await switchFor(admin, { paused: false });
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ mode: "suggest", paused: false });
    expect((await statusFor(other)).body).toEqual({ mode: "suggest", paused: false });
    expect(await ReviewerSwitch.countDocuments()).toBe(1);
  });

  it("can't turn Scribbles on when the deploy has him off", async () => {
    vi.stubEnv("REVIEWER_MODE", "off");
    const admin = await createAdmin();

    const res = await switchFor(admin, { paused: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mode: "off", paused: false });
  });

  it.each([
    ["nothing", {}],
    ["text", { paused: "yes" }],
    ["a mode", { paused: false, mode: "suggest" }],
  ])("takes only true or false (%s is refused or ignored)", async (_, body) => {
    vi.stubEnv("REVIEWER_MODE", "off");
    const admin = await createAdmin();

    const res = await switchFor(admin, body);

    if ("mode" in body) {
      // Anything else is dropped: the mode stays the deploy's
      expect(res.body).toEqual({ mode: "off", paused: false });
    } else {
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "paused must be true or false" });
      expect(await ReviewerSwitch.countDocuments()).toBe(0);
    }
  });

  it("is limited per user, reading and flipping together", async () => {
    const admin = await createAdmin();
    const other = await createAdmin({ id: "google-admin-2", email: "other@example.com" });
    for (let i = 0; i < REVIEWER_SWITCH_REQUESTS_PER_MINUTE; i++) {
      const res = i % 2 === 0 ? await statusFor(admin) : await switchFor(admin, { paused: false });
      expect(res.status).toBe(200);
    }

    const res = await switchFor(admin, { paused: true });

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ message: "Too many requests. Wait a minute, then try again." });
    // Another teacher has a count of their own, and the refused pause
    // didn't happen
    const theirs = await statusFor(other);
    expect(theirs.status).toBe(200);
    expect(theirs.body).toMatchObject({ paused: false });
  });
});
