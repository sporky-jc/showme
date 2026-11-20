import { describe, expect, it } from "vitest";
import type { Types } from "mongoose";
import request from "supertest";
import app from "../app.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { Sentence } from "../models/sentences.js";
import { TIPS } from "../reviewer/tips.js";
import { asReviewed, createAdmin, createSentence, createUser, sessionCookie } from "./helpers.js";

// Step 3: Scribbles' suggestions on the Teacher page, and the tips students
// see with their teacher's decision

const suggest = (sentence: { _id: Types.ObjectId; show: string }, fields: Record<string, unknown> = {}) =>
  ReviewSuggestion.create({
    sentence: sentence._id,
    show: sentence.show,
    verdict: "redo",
    tip: "spelling",
    reasons: ["ai", "spelling"],
    decidedBy: "cloudflare:test-model",
    misspelled: ["cafateria"],
    mechanics: [{ kind: "end-mark", text: "loud" }],
    ...fields,
  });

const decide = (admin: { id: string }, sentence: { _id: unknown; createdAt: Date }, body: Record<string, unknown>) =>
  request(app)
    .patch("/Admin")
    .set("Cookie", sessionCookie(admin))
    .send({ sentence: asReviewed(sentence), ...body });

describe("Scribbles' suggestions on the review queue", () => {
  it("come with each sentence, for its current words only, without who decided", async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const withOne = await createSentence(student, { show: "The cafateria was loud" });
    const edited = await createSentence(student, { title: "day2", show: "New words." });
    await suggest(withOne);
    await suggest({ _id: edited._id, show: "Old words." });

    const res = await request(app).get("/Admin").set("Cookie", sessionCookie(admin));

    const byShow = Object.fromEntries(res.body.map((s: { show: string }) => [s.show, s]));
    expect(byShow["The cafateria was loud"].suggestion).toEqual({
      verdict: "redo",
      tip: { id: "spelling", text: TIPS.spelling },
      reasons: ["ai", "spelling"],
      misspelled: ["cafateria"],
      mechanics: [{ kind: "end-mark", text: "loud" }],
    });
    expect(byShow["New words."].suggestion).toBeUndefined();
  });

  it("are never sent to the student or the gallery", async () => {
    const student = await createUser();
    const sentence = await createSentence(student, { approved: true, tip: "great" });
    await suggest(sentence, { verdict: "approve", tip: "great", reasons: ["ai"] });

    const mine = await request(app).get("/MyPage").set("Cookie", sessionCookie(student));
    const gallery = await request(app).get("/Collections");

    expect(JSON.stringify(mine.body)).not.toContain("suggestion");
    expect(JSON.stringify(gallery.body)).not.toContain("suggestion");
    expect(JSON.stringify(gallery.body)).not.toContain("tip");
  });
});

describe("tips with the teacher's decision", () => {
  it("a 'Try again' carries the tip the teacher chose, and the student sees its words", async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const sentence = await createSentence(student);

    const res = await decide(admin, sentence, { status: "redo", tip: "hear" });
    const mine = await request(app).get("/MyPage").set("Cookie", sessionCookie(student));

    expect(res.status).toBe(201);
    expect(mine.body[0]).toMatchObject({ toRedo: true, tip: { id: "hear", text: TIPS.hear } });
  });

  it("an approval always carries the praise tip", async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const sentence = await createSentence(student);

    await decide(admin, sentence, { status: "approve", tip: "hear" });
    const mine = await request(app).get("/MyPage").set("Cookie", sessionCookie(student));

    expect(mine.body[0]).toMatchObject({ approved: true, tip: { id: "great", text: TIPS.great } });
  });

  it("a 'Try again' with no tip has none", async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const sentence = await createSentence(student, { tip: "hear" });

    await decide(admin, sentence, { status: "redo", tip: null });
    const stored = await Sentence.findById(sentence._id).lean();

    expect(stored).toMatchObject({ toRedo: true });
    expect(stored?.tip).toBeUndefined();
  });

  it.each([
    ["the praise tip with 'Try again'", { status: "redo", tip: "great" }],
    ["a tip that isn't on the list", { status: "redo", tip: "You should be ashamed" }],
    ["a tip that isn't an id", { status: "redo", tip: { $ne: null } }],
  ])("refuses %s", async (_, body) => {
    const admin = await createAdmin();
    const student = await createUser();
    const sentence = await createSentence(student);

    const res = await decide(admin, sentence, body);

    expect(res.status).toBe(400);
    expect(await Sentence.findById(sentence._id).lean()).toMatchObject({ toRedo: false, approved: false });
  });

  it("is cleared when the student edits the sentence", async () => {
    const student = await createUser();
    await createSentence(student, { title: "day1", toRedo: true, tip: "spelling" });

    const res = await request(app)
      .patch("/MyPage")
      .set("Cookie", sessionCookie(student))
      .send({ title: "day1", show: "The cafeteria was loud." });

    expect(res.status).toBe(201);
    expect(res.body.tip).toBeUndefined();
    expect((await Sentence.findOne({ title: "day1" }).lean())?.tip).toBeUndefined();
  });
});

describe("GET /Admin/tips", () => {
  it("lists every tip but the praise, for admins only", async () => {
    const admin = await createAdmin();
    const student = await createUser();

    const res = await request(app).get("/Admin/tips").set("Cookie", sessionCookie(admin));
    const refused = await request(app).get("/Admin/tips").set("Cookie", sessionCookie(student));

    expect(res.status).toBe(200);
    expect(res.body).toContainEqual({ id: "spelling", text: TIPS.spelling });
    expect(res.body.map((tip: { id: string }) => tip.id)).not.toContain("great");
    expect(refused.status).toBe(403);
  });
});
