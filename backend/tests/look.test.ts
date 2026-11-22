import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { STICKER_NOT_IN_SENTENCE } from "../contract/api.js";
import { LOOK_WRITES_PER_MINUTE } from "../middlewares/rateLimit.js";
import { Sentence } from "../models/sentences.js";
import { createSentence, createUser, sessionCookie } from "./helpers.js";

// PUT /MyPage/:id/look: a student picks how their approved sentence looks in
// the gallery, a frame and maybe a sticker with one of its words.

const SHOW = "Pink powder tickled my nose and the crowd’s cheers buzzed.";
const look = { frame: "teal", sticker: { word: "buzzed", sense: "hear" } };

// Ada wrote an approved sentence; Alan is another student
const setUp = async (approved = true) => {
  const ada = await createUser();
  const alan = await createUser({ id: "google-user-2", firstName: "Alan", email: "alan@example.com" });
  const sentence = await createSentence(ada, { approved, show: SHOW, title: "day7" });
  return { ada, alan, sentence, path: `/MyPage/${sentence._id}/look` };
};

const put = (path: string, user: Parameters<typeof sessionCookie>[0], body: unknown) =>
  request(app).put(path).set("Cookie", sessionCookie(user)).send(body as object);

describe("PUT /MyPage/:id/look", () => {
  it("needs a login", async () => {
    const { path } = await setUp();
    expect((await request(app).put(path).send(look)).status).toBe(401);
  });

  it("saves the frame and sticker, and sends the sentence back with them", async () => {
    const { ada, path, sentence } = await setUp();

    const res = await put(path, ada, look);

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(String(sentence._id));
    expect(res.body.look).toEqual(look);
    expect((await Sentence.findById(sentence._id))?.toObject().look).toEqual(look);
  });

  it("can be a frame with no sticker, and a new pick replaces the last", async () => {
    const { ada, path } = await setUp();
    await put(path, ada, look);

    const res = await put(path, ada, { frame: "sun", sticker: null });

    expect(res.status).toBe(200);
    expect(res.body.look).toEqual({ frame: "sun", sticker: null });
  });

  it("reads the sticker word the way the sentence is written: any capitals, curly apostrophes", async () => {
    const { ada, path } = await setUp();

    const res = await put(path, ada, { frame: "violet", sticker: { word: " Crowd's ", sense: "hear" } });

    expect(res.status).toBe(200);
    expect(res.body.look.sticker).toEqual({ word: "crowd's", sense: "hear" });
  });

  it("only takes a word from the sentence, so nothing unreviewed reaches the gallery", async () => {
    const { ada, path, sentence } = await setUp();

    for (const word of ["rainbow", "buzz", "tickled my"]) {
      const res = await put(path, ada, { frame: "violet", sticker: { word, sense: "see" } });
      expect(res.status).toBe(400);
    }
    const res = await put(path, ada, { frame: "violet", sticker: { word: "rainbow", sense: "see" } });
    expect(res.body.message).toBe(STICKER_NOT_IN_SENTENCE);
    expect((await Sentence.findById(sentence._id))?.toObject().look).toBeUndefined();
  });

  it.each([
    ["an unknown frame", { frame: "gold", sticker: null }],
    ["no frame", { sticker: null }],
    ["an unknown sense", { frame: "teal", sticker: { word: "buzzed", sense: "think" } }],
    ["a sticker that isn't text", { frame: "teal", sticker: { word: { $ne: "" }, sense: "hear" } }],
  ])("refuses %s", async (_, body) => {
    const { ada, path } = await setUp();
    expect((await put(path, ada, body)).status).toBe(400);
  });

  it("refuses an id that isn't a real id", async () => {
    const { ada } = await setUp();
    expect((await put("/MyPage/not-an-id/look", ada, look)).status).toBe(400);
  });

  it("can't change another student's sentence", async () => {
    const { alan, path, sentence } = await setUp();

    expect((await put(path, alan, look)).status).toBe(404);
    expect((await Sentence.findById(sentence._id))?.toObject().look).toBeUndefined();
  });

  it("waits until the sentence is approved", async () => {
    const { ada, path } = await setUp(false);
    expect((await put(path, ada, look)).status).toBe(404);
  });

  it("shows the look in the gallery and on My sentences", async () => {
    const { ada, path } = await setUp();
    await put(path, ada, look);

    const gallery = await request(app).get("/Collections");
    expect(gallery.body[0].look).toEqual(look);
    const mine = await request(app).get("/MyPage").set("Cookie", sessionCookie(ada));
    expect(mine.body[0].look).toEqual(look);
  });

  it("is cleared when the student edits the sentence: the sticker was one of the old words", async () => {
    const { ada, path, sentence } = await setUp();
    await put(path, ada, look);

    const res = await request(app)
      .patch("/MyPage")
      .set("Cookie", sessionCookie(ada))
      .send({ title: "day7", show: "Glitter rained down on everyone." });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("look");
    expect((await Sentence.findById(sentence._id))?.toObject().look).toBeUndefined();
  });

  it("limits how many picks a student sends in a minute", async () => {
    const { ada, path } = await setUp();
    for (let i = 0; i < LOOK_WRITES_PER_MINUTE; i++) {
      expect((await put(path, ada, look)).status).toBe(200);
    }
    expect((await put(path, ada, look)).status).toBe(429);
  });
});
