import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { UNDO_STALE } from "../contract/api.js";
import { RECENT_DECISIONS } from "../controllers/routes.js";
import Profile from "../models/profile.js";
import { Sentence } from "../models/sentences.js";
import {
  asReviewed,
  createAdmin,
  createSentence,
  createUser,
  fieldsOf,
  SENTENCE_FIELDS,
  sessionCookie,
  showsIn,
} from "./helpers.js";

// Taking back a teacher's decision (GET /Admin/decisions, PATCH
// /Admin/undo): an approved sentence comes out of the gallery, or a sentence
// sent back stops being sent back, and it waits for review again.

const undo = (who: { id: string }, body: object) =>
  request(app).patch("/Admin/undo").set("Cookie", sessionCookie(who)).send(body);

describe("/Admin/decisions and /Admin/undo access control", () => {
  it.each([
    ["get", "/Admin/decisions"],
    ["patch", "/Admin/undo"],
  ] as const)("%s %s without a login returns 401", async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  it.each([
    ["get", "/Admin/decisions"],
    ["patch", "/Admin/undo"],
  ] as const)("%s %s as a non-admin returns 403", async (method, path) => {
    const user = await createUser();
    const res = await request(app)[method](path).set("Cookie", sessionCookie(user));
    expect(res.status).toBe(403);
  });

  it("refuses a student's undo and leaves the sentence in the gallery", async () => {
    const user = await createUser();
    const sentence = await createSentence(user, { approved: true });

    const res = await undo(user, { status: "approve", sentence: asReviewed(sentence) });

    expect(res.status).toBe(403);
    expect((await Sentence.findById(sentence._id))?.approved).toBe(true);
  });

  it("refuses a login that was logged out", async () => {
    const admin = await createAdmin();
    const cookie = sessionCookie(admin);
    await Profile.updateOne({ _id: admin._id }, { $inc: { tokenVersion: 1 } });

    const res = await request(app).get("/Admin/decisions").set("Cookie", cookie);

    expect(res.status).toBe(401);
  });
});

describe("GET /Admin/decisions", () => {
  it("lists approved and sent-back sentences, newest decision first, with whole names", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const first = await createSentence(user, { show: "decided first" });
    const second = await createSentence(user, { show: "decided second", title: "day2" });
    await createSentence(user, { show: "still waiting", title: "day3" });
    // Decided in this order, through the Teacher page
    await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: asReviewed(first) });
    await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "redo", sentence: asReviewed(second) });

    const res = await request(app).get("/Admin/decisions").set("Cookie", sessionCookie(admin));

    expect(res.status).toBe(200);
    expect(showsIn(res)).toEqual(["decided second", "decided first"]);
    expect(res.body[0]).toMatchObject({ approved: false, toRedo: true });
    expect(res.body[1]).toMatchObject({ approved: true, toRedo: false });
    // The teacher sees the whole name, and nothing else from the profile
    expect(res.body[0].author).toStrictEqual({ firstName: "Ada", lastName: "Lovelace" });
    const fields = [...SENTENCE_FIELDS, "author"].sort();
    expect(res.body.map(fieldsOf)).toEqual([fields, fields]);
  });

  it("puts sentences decided before decisions were dated after the dated ones", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    await createSentence(user, { show: "old approval", approved: true, createdAt: new Date("2025-01-01") });
    const recent = await createSentence(user, { show: "new approval", title: "day2", createdAt: new Date("2024-01-01") });
    await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: asReviewed(recent) });

    const res = await request(app).get("/Admin/decisions").set("Cookie", sessionCookie(admin));

    expect(showsIn(res)).toEqual(["new approval", "old approval"]);
  });

  it(`lists at most ${RECENT_DECISIONS}`, async () => {
    const admin = await createAdmin();
    const user = await createUser();
    await Sentence.insertMany(
      Array.from({ length: RECENT_DECISIONS + 5 }, (_, n) => ({
        title: `day${n + 1}`,
        tell: "It is cold.",
        show: `Sentence ${n}`,
        author: user._id,
        GID: user.id,
        approved: true,
      }))
    );

    const res = await request(app).get("/Admin/decisions").set("Cookie", sessionCookie(admin));

    expect(res.body).toHaveLength(RECENT_DECISIONS);
  });

  // The same rule as the review queue's
  it("shows the test admin only test accounts' decisions, and a real teacher only the others", async () => {
    const teacher = await createAdmin();
    const testAdmin = await createAdmin({ id: "test-admin", email: "test-admin@example.com" });
    const student = await createUser();
    const testStudent = await createUser({ id: "test-student", email: "test-student@example.com" });
    await createSentence(student, { show: "real", approved: true });
    await createSentence(testStudent, { show: "test", approved: true });

    const forTeacher = await request(app).get("/Admin/decisions").set("Cookie", sessionCookie(teacher));
    const forTestAdmin = await request(app).get("/Admin/decisions").set("Cookie", sessionCookie(testAdmin));

    expect(showsIn(forTeacher)).toEqual(["real"]);
    expect(showsIn(forTestAdmin)).toEqual(["test"]);
  });
});

describe("PATCH /Admin/undo", () => {
  it("takes an approved sentence out of the gallery and puts it back in the queue", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const sentence = await createSentence(user, { show: "approve me" });
    await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: asReviewed(sentence) });
    expect(showsIn(await request(app).get("/Collections"))).toEqual(["approve me"]);

    const res = await undo(admin, { status: "approve", sentence: asReviewed(sentence) });

    expect(res.status).toBe(201);
    expect(res.body.queue.map((s: { show: string }) => s.show)).toEqual(["approve me"]);
    expect(res.body.decisions).toEqual([]);
    // Really waiting again: not approved, not sent back, no praise tip, and
    // out of the gallery
    const saved = await Sentence.findById(sentence._id).lean();
    expect(saved).toMatchObject({ approved: false, toRedo: false, show: "approve me" });
    expect(saved).not.toHaveProperty("tip");
    expect(saved).not.toHaveProperty("decidedAt");
    expect(saved?.createdAt).toEqual(sentence.createdAt);
    expect(showsIn(await request(app).get("/Collections"))).toEqual([]);
    expect(showsIn(await request(app).get("/Admin").set("Cookie", sessionCookie(admin)))).toEqual([
      "approve me",
    ]);
  });

  it("takes back a send-back, tip and all", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const sentence = await createSentence(user, { toRedo: true, tip: "hear" });

    const res = await undo(admin, { status: "redo", sentence: asReviewed(sentence) });

    expect(res.status).toBe(201);
    const saved = await Sentence.findById(sentence._id).lean();
    expect(saved).toMatchObject({ approved: false, toRedo: false });
    expect(saved).not.toHaveProperty("tip");
    // The student's own page shows it waiting, with no tip
    const mine = await request(app).get("/MyPage").set("Cookie", sessionCookie(user));
    expect(mine.body[0]).toMatchObject({ approved: false, toRedo: false });
    expect(mine.body[0]).not.toHaveProperty("tip");
  });

  // The page's decision must match the sentence's: taking back an approval
  // never touches a sentence sent back, nor the other way round
  it.each([
    ["approve", { toRedo: true }],
    ["redo", { approved: true }],
    ["approve", {}],
    ["redo", {}],
  ] as const)("refuses to undo %s for a sentence that is %o", async (status, state) => {
    const admin = await createAdmin();
    const user = await createUser();
    const sentence = await createSentence(user, state);

    const res = await undo(admin, { status, sentence: asReviewed(sentence) });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(UNDO_STALE);
    expect(await Sentence.findById(sentence._id).lean()).toMatchObject({
      approved: false,
      toRedo: false,
      ...state,
    });
  });

  it("refuses once the student has edited the sentence since the page loaded", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const sentence = await createSentence(user, { approved: true });
    const shown = asReviewed(sentence);
    // Edited, then approved again: the page still shows the old words' date
    await Sentence.updateOne({ _id: sentence._id }, { $set: { createdAt: new Date(Date.now() + 1000) } });

    const res = await undo(admin, { status: "approve", sentence: shown });

    expect(res.status).toBe(409);
    expect((await Sentence.findById(sentence._id))?.approved).toBe(true);
  });

  it("returns 404 for a sentence that doesn't exist", async () => {
    const admin = await createAdmin();

    const res = await undo(admin, {
      status: "approve",
      sentence: { _id: "0123456789abcdef01234567", createdAt: new Date().toISOString() },
    });

    expect(res.status).toBe(404);
  });

  // The id goes into a database query: an object would pick out a sentence
  // nobody chose
  it.each([[{ $ne: null }], [{ $gt: "" }], ["not-an-id"], [12345]])(
    "refuses the id %o without changing anything",
    async (_id) => {
      const admin = await createAdmin();
      const user = await createUser();
      await createSentence(user, { approved: true });

      const res = await undo(admin, {
        status: "approve",
        sentence: { _id, createdAt: new Date().toISOString() },
      });

      expect(res.status).toBe(400);
      expect(await Sentence.countDocuments({ approved: true })).toBe(1);
    }
  );

  it.each([["publish"], [""], [undefined]])("refuses the status %o", async (status) => {
    const admin = await createAdmin();
    const user = await createUser();
    const sentence = await createSentence(user, { approved: true });

    const res = await undo(admin, { status, sentence: asReviewed(sentence) });

    expect(res.status).toBe(400);
    expect((await Sentence.findById(sentence._id))?.approved).toBe(true);
  });

  it("doesn't crash without a body", async () => {
    const admin = await createAdmin();

    const res = await request(app).patch("/Admin/undo").set("Cookie", sessionCookie(admin));

    expect(res.status).toBe(400);
  });

  // The same rule as the review itself (see reviewQueue)
  it("lets the test admin take back only test accounts' decisions", async () => {
    const testAdmin = await createAdmin({ id: "test-admin", email: "test-admin@example.com" });
    const student = await createUser();
    const testStudent = await createUser({ id: "test-student", email: "test-student@example.com" });
    const real = await createSentence(student, { show: "real", approved: true });
    const test = await createSentence(testStudent, { show: "test", approved: true });

    const refused = await undo(testAdmin, { status: "approve", sentence: asReviewed(real) });
    const allowed = await undo(testAdmin, { status: "approve", sentence: asReviewed(test) });

    expect(refused.status).toBe(404);
    expect((await Sentence.findById(real._id))?.approved).toBe(true);
    expect(allowed.status).toBe(201);
    expect((await Sentence.findById(test._id))?.approved).toBe(false);
  });
});
