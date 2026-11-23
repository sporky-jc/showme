import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { Sentence } from "../models/sentences.js";
import mongoose from "mongoose";
import { aiHighlightsShown, readOwnerSettings } from "../models/ownerSettings.js";
import { TEST_ACCOUNT_PREFIX } from "../config/testAccounts.js";
import { isOwnerEmail } from "../middlewares/owner.js";
import { TAGS_PER_DAY } from "../tagger/queue.js";
import { createAdmin, createUser, sessionCookie } from "./helpers.js";

// GET and PATCH /Admin/owner: the Owner settings on the Teacher page, which
// only the site's owner (OWNER_EMAIL) sees: the sense tagger's switch, and
// whether kids see its highlights.

const OWNER = "owner@example.com";
const settingsFor = (user: { id: string }) => request(app).get("/Admin/owner").set("Cookie", sessionCookie(user));
const changeFor = (user: { id: string }, body: unknown) =>
  request(app).patch("/Admin/owner").set("Cookie", sessionCookie(user)).send(body as object);

beforeEach(() => {
  vi.stubEnv("OWNER_EMAIL", OWNER);
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
  vi.stubEnv("CLOUDFLARE_AI_TOKEN", "t".repeat(40));
});
afterEach(() => vi.unstubAllEnvs());

describe("who can use the Owner settings", () => {
  it("needs a login", async () => {
    expect((await request(app).get("/Admin/owner")).status).toBe(401);
  });

  it("is for admins only", async () => {
    expect((await settingsFor(await createUser({ email: OWNER }))).status).toBe(403);
  });

  it("refuses a teacher who isn't the owner, to look or to change", async () => {
    const teacher = await createAdmin();
    for (const res of [await settingsFor(teacher), await changeFor(teacher, { senseTagger: true })]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: "Only the site's owner can use these settings." });
    }
    expect((await readOwnerSettings()).senseTagger).toBe(false);
  });

  it("refuses everyone when no owner is set", async () => {
    vi.stubEnv("OWNER_EMAIL", "");
    expect((await settingsFor(await createAdmin({ email: OWNER }))).status).toBe(403);
  });

  it("never lets a test account in, even with the owner's email", async () => {
    const qa = await createAdmin({ id: `${TEST_ACCOUNT_PREFIX}admin`, email: OWNER });
    expect((await changeFor(qa, { senseTagger: true })).status).toBe(403);
  });

  it("matches the owner's email whatever its case or spaces", () => {
    expect(isOwnerEmail(" Owner@Example.com ", OWNER)).toBe(true);
    expect(isOwnerEmail("other@example.com", OWNER)).toBe(false);
    expect(isOwnerEmail(OWNER, "")).toBe(false);
  });
});

describe("the sense tagger's switch", () => {
  it("starts off, ready when the Cloudflare keys are set, with today's count", async () => {
    const owner = await createAdmin({ email: OWNER });
    await Sentence.create({
      title: "Day 1",
      tell: "It is cold outside.",
      show: "The bell rang.",
      author: owner._id,
      GID: owner.id,
      approved: true,
      taggedShow: "The bell rang.",
      taggedAt: new Date(),
    });

    const res = await settingsFor(owner);

    expect(res.status).toBe(200);
    expect(res.body.senseTagger).toMatchObject({ on: false, ready: true, today: 1, perDay: TAGS_PER_DAY });
    expect(res.body.senseTagger.lastTaggedAt).toEqual(expect.any(String));
  });

  it("isn't ready without the Cloudflare keys", async () => {
    vi.stubEnv("CLOUDFLARE_AI_TOKEN", "");
    const res = await settingsFor(await createAdmin({ email: OWNER }));
    expect(res.body.senseTagger).toMatchObject({ ready: false });
  });

  it("turns on and off, and says when", async () => {
    const owner = await createAdmin({ email: OWNER });

    const on = await changeFor(owner, { senseTagger: true });
    expect(on.status).toBe(200);
    expect(on.body.senseTagger).toMatchObject({ on: true, changedAt: expect.any(String) });
    expect((await readOwnerSettings()).senseTagger).toBe(true);

    const off = await changeFor(owner, { senseTagger: false });
    expect(off.body.senseTagger.on).toBe(false);
    expect((await readOwnerSettings()).senseTagger).toBe(false);
  });

  it("refuses a body that isn't true or false (400)", async () => {
    const owner = await createAdmin({ email: OWNER });
    const res = await changeFor(owner, { senseTagger: "yes" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "senseTagger must be true or false" });
  });
});

describe("the show AI highlights switch", () => {
  const tagged = async (author: Awaited<ReturnType<typeof createAdmin>>) =>
    Sentence.create({
      title: "Day 1",
      tell: "It is noisy.",
      show: "The bell rang.",
      author: author._id,
      GID: author.id,
      approved: true,
      senseTags: [{ word: "rang", sense: "hear" }],
      taggedShow: "The bell rang.",
      taggedAt: new Date(),
    });
  const gallery = async () => (await request(app).get("/Collections")).body as { show: string; senseTags?: unknown }[];

  it("starts off: the tagger can run while kids see only the word list", async () => {
    const owner = await createAdmin({ email: OWNER });
    await tagged(owner);
    await changeFor(owner, { senseTagger: true });

    const res = await settingsFor(owner);
    expect(res.body.showAiHighlights).toEqual({ on: false });
    expect((await gallery())[0]).not.toHaveProperty("senseTags");
  });

  it("shows kids the AI highlights when on, and hides them again when off", async () => {
    const owner = await createAdmin({ email: OWNER });
    await tagged(owner);

    const on = await changeFor(owner, { showAiHighlights: true });
    expect(on.status).toBe(200);
    expect(on.body.showAiHighlights).toEqual({ on: true, changedAt: expect.any(String) });
    expect((await gallery())[0].senseTags).toEqual([{ word: "rang", sense: "hear" }]);

    await changeFor(owner, { showAiHighlights: false });
    expect((await gallery())[0]).not.toHaveProperty("senseTags");
  });

  it("is changed apart from the tagger's switch", async () => {
    const owner = await createAdmin({ email: OWNER });
    await changeFor(owner, { senseTagger: true });
    await changeFor(owner, { showAiHighlights: true });
    await changeFor(owner, { senseTagger: false });

    expect(await readOwnerSettings()).toMatchObject({ senseTagger: false, showAiHighlights: true });
  });

  it("refuses a change that changes nothing, or isn't true or false (400)", async () => {
    const owner = await createAdmin({ email: OWNER });
    expect((await changeFor(owner, {})).body).toEqual({ message: "Say which setting to change" });
    const res = await changeFor(owner, { showAiHighlights: "yes" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "showAiHighlights must be true or false" });
  });

  it("can't be changed by a teacher who isn't the owner", async () => {
    expect((await changeFor(await createAdmin(), { showAiHighlights: true })).status).toBe(403);
    expect((await readOwnerSettings()).showAiHighlights).toBe(false);
  });

  it("is off when the settings can't be read, and the Gallery still loads", async () => {
    const owner = await createAdmin({ email: OWNER });
    await tagged(owner);
    await changeFor(owner, { showAiHighlights: true });
    const down = vi.spyOn(mongoose.model("OwnerSettings"), "findById").mockImplementation(() => {
      throw new Error("database down");
    });

    expect(await aiHighlightsShown()).toBe(false);
    const res = await request(app).get("/Collections");
    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty("senseTags");
    down.mockRestore();
  });
});
