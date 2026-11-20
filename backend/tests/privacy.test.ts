import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createSentence, createUser, sessionCookie } from "./helpers.js";

// A student's surname is only for their teacher (the Teacher page, admins
// only) and for the student themselves (their own profile, GET /Login). Every
// other answer a student or a signed-out visitor can get must leave it out,
// along with the author's email and Google account id: anyone can read an
// answer whole, not just what the page shows of it.

// Mia wrote an approved sentence and one waiting for review; Ada is another
// student, looking at the gallery
const setUp = async () => {
  const mia = await createUser({
    id: "google-mia",
    firstName: "Mia",
    lastName: "Torres",
    email: "mia.torres@example.com",
  });
  const ada = await createUser();
  const approved = await createSentence(mia, { approved: true, show: "Frost bit my fingers." });
  await createSentence(mia, { title: "day2", show: "The road shimmered." });
  return { mia, ada, approved };
};

// Mia's surname, email or Google account id, anywhere in the answer
const MIA = /Torres|mia\.torres|google-mia/;

describe("a student's surname stays with their teacher", () => {
  it("is left out of the gallery for a signed-out visitor", async () => {
    await setUp();

    const res = await request(app).get("/Collections");

    expect(res.status).toBe(200);
    expect(res.body[0].author).toStrictEqual({ firstName: "Mia", lastName: "T" });
    expect(JSON.stringify(res.body)).not.toMatch(MIA);
  });

  it.each([
    ["get", "/Collections"],
    ["get", "/Collections/likes"],
    ["get", "/MyPage"],
    ["get", "/"],
  ] as const)("is left out of %s %s for another student", async (method, path) => {
    const { ada } = await setUp();

    const res = await request(app)[method](path).set("Cookie", sessionCookie(ada));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(MIA);
  });

  it.each(["put", "delete"] as const)("is left out of a %s like's answer", async (method) => {
    const { ada, approved } = await setUp();

    const res = await request(app)
      [method](`/Collections/${approved._id}/like`)
      .set("Cookie", sessionCookie(ada));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(MIA);
  });

  // Her own sentences don't carry her name at all; her own profile does
  // (it's hers, and the menu shows it)
  it("is left out of the student's own sentences", async () => {
    const { mia } = await setUp();

    const res = await request(app).get("/MyPage").set("Cookie", sessionCookie(mia));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(MIA);
  });

  it.each([
    ["get", "/Admin"],
    ["get", "/Admin/decisions"],
    ["get", "/Admin/tips"],
    ["patch", "/Admin/undo"],
  ] as const)("can't be reached by a student through %s %s", async (method, path) => {
    const { ada } = await setUp();

    const res = await request(app)[method](path).set("Cookie", sessionCookie(ada));

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(MIA);
  });
});
