import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { Sentence } from "../models/sentences.js";
import { TEST_LOGINS_PER_MINUTE } from "../middlewares/rateLimit.js";
import { mintTestPass } from "../utils/testPass.js";
import {
  asReviewed,
  createAdmin,
  createSentence,
  createUser,
  sessionCookie,
  showsIn,
} from "./helpers.js";

// What the staging test login's accounts may do, so that a leaked test-login
// secret couldn't be used against real people's data (see testLogin.ts).

// The test admin, as the staging test login creates it (id "test-admin")
const testAdmin = () =>
  createAdmin({ id: "test-admin", email: "test-admin@showme.test" });

// A test student's sentence and a real student's sentence, both waiting for
// review
const setUp = async () => {
  const tester = await createUser({
    id: "test-student-approve",
    email: "test-student-approve@showme.test",
  });
  const real = await createUser({ id: "104512345678901234567" });
  const testSentence = await createSentence(tester, { show: "Test sentence" });
  const realSentence = await createSentence(real, { show: "Real sentence" });
  return { testSentence, realSentence };
};

describe("the test admin only reviews test accounts' sentences", () => {
  it("sees only test accounts' sentences in the review queue", async () => {
    await setUp();
    const admin = await testAdmin();

    const res = await request(app).get("/Admin").set("Cookie", sessionCookie(admin));

    expect(res.status).toBe(200);
    expect(showsIn(res)).toEqual(["Test sentence"]);
  });

  it("can approve a test account's sentence", async () => {
    const { testSentence } = await setUp();
    const admin = await testAdmin();

    const res = await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: asReviewed(testSentence) });

    expect(res.status).toBe(201);
    expect((await Sentence.findById(testSentence._id).orFail()).approved).toBe(true);
  });

  it.each(["approve", "redo"])(
    "cannot %s a real person's sentence (404, unchanged)",
    async (status) => {
      const { realSentence } = await setUp();
      const admin = await testAdmin();

      const res = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(admin))
        .send({ status, sentence: asReviewed(realSentence) });

      expect(res.status).toBe(404);
      const after = await Sentence.findById(realSentence._id).orFail();
      expect(after.approved).toBe(false);
      expect(after.toRedo).toBe(false);
    }
  );

  it("leaves real admins able to review real sentences, without the test accounts' in their queue", async () => {
    const { realSentence } = await setUp();
    const admin = await createAdmin(); // a Google account id, not "test-..."

    const queue = await request(app).get("/Admin").set("Cookie", sessionCookie(admin));
    const res = await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: asReviewed(realSentence) });

    expect(showsIn(queue)).toEqual(["Real sentence"]);
    expect(res.status).toBe(201);
  });
});

describe("the test login's rate limit", () => {
  it(`refuses test logins beyond ${TEST_LOGINS_PER_MINUTE} a minute (429), counting wrong passes too`, async () => {
    vi.stubEnv("TEST_LOGIN_KEY", "k".repeat(64));
    vi.stubEnv("GCLOUD_PROJECT", "showme-staging");

    for (let i = 0; i < TEST_LOGINS_PER_MINUTE; i++) {
      const res = await request(app)
        .post("/auth/test")
        .send({ secret: "wrong-guess", role: "admin" });
      expect(res.status).toBe(401);
    }
    const over = await request(app)
      .post("/auth/test")
      .send({ secret: mintTestPass("k".repeat(64), Math.floor(Date.now() / 1000) + 3600), role: "admin" });

    expect(over.status).toBe(429);
    vi.unstubAllEnvs();
  });
});
