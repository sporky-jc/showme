import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { REVIEW_STALE } from "../contract/api.js";
import { Sentence } from "../models/sentences.js";
import {
  asReviewed,
  authorsIn,
  createAdmin,
  createSentence,
  createUser,
  fieldsOf,
  SENTENCE_FIELDS,
  sessionCookie,
  showsIn,
} from "./helpers.js";

describe("/Admin access control", () => {
  it.each(["get", "patch"] as const)("%s without a token returns 401", async (method) => {
    const res = await request(app)[method]("/Admin");
    expect(res.status).toBe(401);
  });

  it.each(["get", "patch"] as const)("%s as a non-admin returns 403", async (method) => {
    const user = await createUser();
    const res = await request(app)[method]("/Admin").set("Cookie", sessionCookie(user));
    expect(res.status).toBe(403);
  });
});

describe("requests with no body", () => {
  // Express 5 leaves req.body undefined when there's no body. A signed-in
  // request without one must get a normal error, never a 500 crash.
  it.each([
    ["post", "/MyPage"],
    ["patch", "/MyPage"],
    ["patch", "/Admin"],
  ] as const)("%s %s without a body doesn't crash", async (method, path) => {
    const admin = await createAdmin();

    const res = await request(app)[method](path).set("Cookie", sessionCookie(admin));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("GET /Admin", () => {
  it("lists sentences awaiting review, newest first, with authors", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    await createSentence(user, { show: "older", createdAt: new Date("2024-01-01") });
    await createSentence(user, { show: "newer", createdAt: new Date("2024-02-01") });
    await createSentence(user, { show: "approved", approved: true });
    await createSentence(user, { show: "sent back", toRedo: true });

    const res = await request(app).get("/Admin").set("Cookie", sessionCookie(admin));

    expect(res.status).toBe(200);
    expect(showsIn(res)).toEqual(["newer", "older"]);
    expect(res.body[0].author.firstName).toBe("Ada");
  });

  // Exactly the contract's fields, in the queue and in the queue sent back
  // after a decision
  it("sends each sentence as the contract lists it, and nothing else", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const target = await createSentence(user, { show: "approve me" });
    await createSentence(user, { show: "still waiting" });

    const listed = await request(app).get("/Admin").set("Cookie", sessionCookie(admin));
    const after = await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: asReviewed(target) });

    const fields = [...SENTENCE_FIELDS, "author"].sort();
    expect(listed.body.map(fieldsOf)).toEqual([fields, fields]);
    expect(after.body.map(fieldsOf)).toEqual([fields]);
  });

  // The review page shows only the author's name, so that's all it gets: not
  // their email, Google account id (`id`), admin flag or login token version.
  it("shows only each author's name, never the rest of their profile", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    await createSentence(user);

    const res = await request(app).get("/Admin").set("Cookie", sessionCookie(admin));

    expect(res.status).toBe(200);
    // Exactly these fields: any other field on an author fails the test
    expect(authorsIn(res)).toStrictEqual([
      { firstName: "Ada", lastName: "Lovelace" },
    ]);
    // Each sentence also stores its author's Google account id, as GID
    expect(res.body[0]).not.toHaveProperty("GID");
  });

  it("keeps newest first even for sentences written within the same second", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    await createSentence(user, { show: "older", createdAt: new Date("2026-10-06T04:02:45.643Z") });
    await createSentence(user, { show: "newer", createdAt: new Date("2026-10-06T04:02:45.993Z") });

    const res = await request(app).get("/Admin").set("Cookie", sessionCookie(admin));

    expect(showsIn(res)).toEqual(["newer", "older"]);
  });
});

describe("PATCH /Admin", () => {
  it("returns the remaining queue newest first, even within the same second", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const target = await createSentence(user, { show: "approve me" });
    await createSentence(user, { show: "older", createdAt: new Date("2026-10-06T04:02:45.643Z") });
    await createSentence(user, { show: "newer", createdAt: new Date("2026-10-06T04:02:45.993Z") });

    const res = await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: asReviewed(target) });

    expect(showsIn(res)).toEqual(["newer", "older"]);
  });

  it("approves a sentence and returns the remaining queue", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const target = await createSentence(user, { show: "approve me" });
    await createSentence(user, { show: "still waiting" });

    const res = await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: asReviewed(target) });

    expect(res.status).toBe(201);
    expect(showsIn(res)).toEqual(["still waiting"]);
    // The queue sent back shows only the author's name too (see GET /Admin)
    expect(res.body[0].author).toStrictEqual({ firstName: "Ada", lastName: "Lovelace" });
    expect(res.body[0]).not.toHaveProperty("GID");
    const saved = await Sentence.findById(target._id).orFail();
    expect(saved.approved).toBe(true);
    expect(saved.toRedo).toBe(false);
  });

  it("sends a sentence back for a redo", async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const target = await createSentence(user);

    await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "redo", sentence: asReviewed(target) });

    const saved = await Sentence.findById(target._id).orFail();
    expect(saved.toRedo).toBe(true);
    expect(saved.approved).toBe(false);
  });

  // Only "approve" and "redo" are decisions (see contract/api.ts). Anything
  // else used to be saved as "no change"; now it's refused outright.
  it.each([["publish"], [""], [undefined], [true]])(
    "refuses a decision that isn't approve or redo (%j), changing nothing",
    async (status) => {
      const admin = await createAdmin();
      const user = await createUser();
      const target = await createSentence(user, { approved: true });

      const res = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(admin))
        .send({ status, sentence: asReviewed(target) });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("The status must be approve or redo");
      const saved = await Sentence.findById(target._id).orFail();
      expect(saved.approved).toBe(true);
      expect(saved.toRedo).toBe(false);
    }
  );

  // An id that's a database instruction, like {"$ne": null} ("any
  // sentence"), must not approve a sentence nobody picked.
  it.each([[{ $ne: null }], [{ $gt: "" }], ["not-an-id"], [12345]])(
    "refuses a sentence id that isn't one (%j) and approves nothing",
    async (id) => {
      const admin = await createAdmin();
      const author = await createUser();
      await createSentence(author, { title: "Day 1" });

      const res = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(admin))
        .send({ status: "approve", sentence: { _id: id, createdAt: new Date().toISOString() } });

      expect(res.status).toBe(400);
      expect(await Sentence.countDocuments({ approved: true })).toBe(0);
    }
  );

  // A decision counts only for the sentence the reviewer's page showed: still
  // waiting, with the same date (see ReviewBody). Anything else is refused
  // with 409 and changes nothing.
  describe("a decision from a page that is out of date", () => {
    it("can't approve words the student changed after the page loaded", async () => {
      const admin = await createAdmin();
      const user = await createUser();
      const target = await createSentence(user, { show: "The old words." });
      const seen = asReviewed(target);

      // The student edits it while it's on the reviewer's page
      await request(app)
        .patch("/MyPage")
        .set("Cookie", sessionCookie(user))
        .send({ title: target.title, show: "Words nobody has read." });
      const res = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(admin))
        .send({ status: "approve", sentence: seen });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe(REVIEW_STALE);
      const saved = await Sentence.findById(target._id).orFail();
      expect(saved.approved).toBe(false);
      expect(saved.show).toBe("Words nobody has read.");
    });

    it.each([
      ["redo", "already approved", { approved: true, toRedo: false }],
      ["approve", "already sent back", { approved: false, toRedo: true }],
      ["approve", "already approved", { approved: true, toRedo: false }],
    ] as const)("can't %s a sentence that was %s", async (status, _was, state) => {
      const admin = await createAdmin();
      const user = await createUser();
      const target = await createSentence(user, state);

      const res = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(admin))
        .send({ status, sentence: asReviewed(target) });

      expect(res.status).toBe(409);
      const saved = await Sentence.findById(target._id).orFail();
      expect(saved.approved).toBe(state.approved);
      expect(saved.toRedo).toBe(state.toRedo);
    });

    it("lets only the first of two reviewers decide", async () => {
      const admin = await createAdmin();
      const other = await createAdmin({ id: "google-admin-2", email: "admin2@example.com" });
      const user = await createUser();
      const target = await createSentence(user);

      const first = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(admin))
        .send({ status: "approve", sentence: asReviewed(target) });
      const second = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(other))
        .send({ status: "redo", sentence: asReviewed(target) });

      expect(first.status).toBe(201);
      expect(second.status).toBe(409);
      const saved = await Sentence.findById(target._id).orFail();
      expect(saved.approved).toBe(true);
      expect(saved.toRedo).toBe(false);
    });

    // Some early sentences hold their date as text, and a few have none.
    // Their reviewer's page must still be able to decide on them.
    it.each([
      ["a date stored as text (ISO)", "2023-05-01T12:00:00.000Z"],
      ["a date stored as text (old style)", "Mon May 01 2023 12:00:00 GMT+0000"],
      ["no stored date", undefined],
    ])("can decide on a sentence with %s, as the page shows it", async (_kind, createdAt) => {
      const admin = await createAdmin();
      const user = await createUser();
      const { insertedId } = await Sentence.collection.insertOne({
        title: "Day 1",
        tell: "The room was messy.",
        show: "Old words.",
        author: user._id,
        GID: user.id,
        approved: false,
        toRedo: false,
        ...(createdAt === undefined ? {} : { createdAt }),
      });

      const queue = await request(app).get("/Admin").set("Cookie", sessionCookie(admin));
      const shown = queue.body.find((s: { _id: string }) => s._id === String(insertedId));
      const res = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(admin))
        .send({ status: "approve", sentence: { _id: shown._id, createdAt: shown.createdAt } });

      expect(res.status).toBe(201);
      expect((await Sentence.collection.findOne({ _id: insertedId }))?.approved).toBe(true);
    });

    it("refuses an old page's date for a sentence stored with a text date", async () => {
      const admin = await createAdmin();
      const user = await createUser();
      const { insertedId } = await Sentence.collection.insertOne({
        title: "Day 1",
        tell: "The room was messy.",
        show: "Old words.",
        author: user._id,
        GID: user.id,
        approved: false,
        toRedo: false,
        createdAt: "2023-05-01T12:00:00.000Z",
      });

      const res = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(admin))
        .send({
          status: "approve",
          sentence: { _id: String(insertedId), createdAt: "2023-04-30T12:00:00.000Z" },
        });

      expect(res.status).toBe(409);
      expect((await Sentence.collection.findOne({ _id: insertedId }))?.approved).toBe(false);
    });

    it("refuses a decision with no date (400), changing nothing", async () => {
      const admin = await createAdmin();
      const user = await createUser();
      const target = await createSentence(user);

      const res = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(admin))
        .send({ status: "approve", sentence: { _id: String(target._id) } });

      expect(res.status).toBe(400);
      expect((await Sentence.findById(target._id).orFail()).approved).toBe(false);
    });
  });

  it("returns 404 for a sentence that doesn't exist", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: { _id: "65f000000000000000000000", createdAt: new Date().toISOString() } });

    expect(res.status).toBe(404);
  });
});
