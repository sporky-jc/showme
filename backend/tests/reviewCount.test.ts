import { describe, expect, it } from "vitest";
import type { Types } from "mongoose";
import request from "supertest";
import app from "../app.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import type { Reason } from "../reviewer/contract.js";
import { REVIEW_COUNT_REQUESTS_PER_MINUTE } from "../middlewares/rateLimit.js";
import { createAdmin, createSentence, createUser, sessionCookie } from "./helpers.js";

// GET /Admin/count: the badge on the site's Teacher link, so a teacher
// notices a sentence to check in on without opening the Teacher page

const suggest = (sentence: { _id: Types.ObjectId; show: string }, reasons: Reason[]) =>
  ReviewSuggestion.create({
    sentence: sentence._id,
    show: sentence.show,
    verdict: "unsure",
    reasons,
    decidedBy: "rules",
  });

const countFor = (user: { id: string }) =>
  request(app).get("/Admin/count").set("Cookie", sessionCookie(user));

describe("GET /Admin/count", () => {
  it("needs a login", async () => {
    const res = await request(app).get("/Admin/count");

    expect(res.status).toBe(401);
  });

  it("is for admins only", async () => {
    const student = await createUser();

    const res = await countFor(student);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. Admins only." });
  });

  it("is zero for an empty queue", async () => {
    const admin = await createAdmin();

    const res = await countFor(admin);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ checkIn: 0, waiting: 0 });
  });

  it("counts the waiting sentences, and those held as worrying for their current words", async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const worrying = await createSentence(student, { title: "day1", show: "I feel sad all the time." });
    const alsoWorrying = await createSentence(student, { title: "day2", show: "Nobody would miss me." });
    const sensitive = await createSentence(student, { title: "day3", show: "The fish died." });
    const edited = await createSentence(student, { title: "day4", show: "New happy words." });
    await createSentence(student, { title: "day5", show: "No suggestion yet." });
    await suggest(worrying, ["worrying"]);
    await suggest(alsoWorrying, ["worrying", "sensitive-words"]);
    await suggest(sensitive, ["sensitive-words"]);
    // About words the student has since changed: no longer counts
    await suggest({ _id: edited._id, show: "Old worrying words." }, ["worrying"]);
    // Already decided: not waiting, so neither count includes it
    const approved = await createSentence(student, { title: "day6", show: "Done.", approved: true });
    await suggest(approved, ["worrying"]);
    const sentBack = await createSentence(student, { title: "day7", show: "Again.", toRedo: true });
    await suggest(sentBack, ["worrying"]);

    const res = await countFor(admin);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ checkIn: 2, waiting: 5 });
  });

  it("follows the queue's test-account rule: the test admin counts only test sentences, a teacher none of them", async () => {
    const teacher = await createAdmin();
    const testAdmin = await createAdmin({ id: "test-admin", email: "test-admin@showme.test" });
    const student = await createUser();
    const tester = await createUser({ id: "test-student-count", email: "t@showme.test" });
    const real = await createSentence(student, { title: "day1", show: "I feel sad." });
    await createSentence(student, { title: "day2", show: "A plain one." });
    const test = await createSentence(tester, { title: "day1", show: "Test worry." });
    await suggest(real, ["worrying"]);
    await suggest(test, ["worrying"]);
    await createSentence(tester, { title: "day2", show: "Test plain." });
    await createSentence(tester, { title: "day3", show: "Test plain again." });

    expect((await countFor(teacher)).body).toEqual({ checkIn: 1, waiting: 2 });
    expect((await countFor(testAdmin)).body).toEqual({ checkIn: 1, waiting: 3 });
  });

  it("is limited per user", async () => {
    const admin = await createAdmin();
    const other = await createAdmin({ id: "google-admin-2", email: "other@example.com" });
    for (let i = 0; i < REVIEW_COUNT_REQUESTS_PER_MINUTE; i++) {
      expect((await countFor(admin)).status).toBe(200);
    }

    const res = await countFor(admin);

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ message: "Too many requests. Wait a minute, then try again." });
    // Another teacher has a count of their own
    expect((await countFor(other)).status).toBe(200);
  });
});
