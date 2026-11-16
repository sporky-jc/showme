import { describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app.js";
import Profile from "../models/profile.js";
import { Sentence } from "../models/sentences.js";
import {
  createAdmin,
  createSentence,
  createUser,
  fieldsOf,
  sessionCookie,
} from "./helpers.js";

// Likes on the Collections page (controllers/likes.ts): only for signed-in
// users. Every approved sentence has 1 like for passing review, plus one per
// student who liked it.

const otherUser = (n = 2) =>
  createUser({
    id: `google-user-${n}`,
    firstName: `Student ${n}`,
    email: `student${n}@example.com`,
  });

// Ada wrote an approved sentence; Alan is another student
const setUp = async () => {
  const ada = await createUser();
  const alan = await otherUser();
  const sentence = await createSentence(ada, { approved: true });
  return { ada, alan, sentence, path: `/Collections/${sentence._id}/like` };
};

const likesIn = (res: request.Response, id: unknown) =>
  res.body.find((entry: { _id: string }) => entry._id === String(id));

describe("likes need a login", () => {
  it.each([
    ["get", "/Collections/likes"],
    ["put", "/Collections/0123456789abcdef01234567/like"],
    ["delete", "/Collections/0123456789abcdef01234567/like"],
  ] as const)("%s %s without a login returns 401", async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  it("refuses a login that was logged out", async () => {
    const { alan, path } = await setUp();
    const cookie = sessionCookie(alan);
    await Profile.updateOne({ _id: alan._id }, { $inc: { tokenVersion: 1 } });

    const res = await request(app).put(path).set("Cookie", cookie);

    expect(res.status).toBe(401);
  });

  it("keeps likes out of GET /Collections, which anyone can load", async () => {
    const { alan, path } = await setUp();
    await request(app).put(path).set("Cookie", sessionCookie(alan));

    // Signed in or not, the public list never carries likes
    for (const cookie of ["", sessionCookie(alan)]) {
      const res = await request(app).get("/Collections").set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      for (const field of ["likes", "likedBy", "likedByMe", "mine"]) {
        expect(res.body[0]).not.toHaveProperty(field);
      }
    }
  });
});

describe("GET /Collections/likes", () => {
  it("gives every approved sentence 1 like for passing review", async () => {
    const { alan, sentence } = await setUp();

    const res = await request(app)
      .get("/Collections/likes")
      .set("Cookie", sessionCookie(alan));

    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual([
      { _id: String(sentence._id), likes: 1, likedByMe: false, mine: false },
    ]);
  });

  it("gives that like to sentences approved before likes existed", async () => {
    const ada = await createUser();
    // Stored the old way: a likeCount of 0 and no likedBy list at all
    const { insertedId } = await Sentence.collection.insertOne({
      title: "day1",
      tell: "It is cold outside.",
      show: "Frost on the window.",
      author: ada._id,
      GID: ada.id,
      approved: true,
      toRedo: false,
      likeCount: 0,
      createdAt: new Date("2023-01-01"),
    });

    const res = await request(app)
      .get("/Collections/likes")
      .set("Cookie", sessionCookie(await otherUser()));

    expect(res.status).toBe(200);
    expect(likesIn(res, insertedId)).toMatchObject({ likes: 1, likedByMe: false });

    // ...and such a sentence can be liked like any other
    const liked = await request(app)
      .put(`/Collections/${insertedId}/like`)
      .set("Cookie", sessionCookie(await Profile.findOne({ id: "google-user-2" }).orFail()));
    expect(liked.body.likes).toBe(2);
  });

  it("lists only approved sentences", async () => {
    const { ada, alan, sentence } = await setUp();
    await createSentence(ada, { title: "day2" }); // waiting for review
    await createSentence(ada, { title: "day3", toRedo: true }); // sent back

    const res = await request(app)
      .get("/Collections/likes")
      .set("Cookie", sessionCookie(alan));

    expect(res.body.map((entry: { _id: string }) => entry._id)).toEqual([
      String(sentence._id),
    ]);
  });

  it("counts each student's like, and says which are the user's own likes and sentences", async () => {
    const { ada, alan, sentence } = await setUp();
    const carol = await otherUser(3);
    await Sentence.updateOne(
      { _id: sentence._id },
      { $set: { likedBy: [alan._id, carol._id] } }
    );

    const asAlan = await request(app)
      .get("/Collections/likes")
      .set("Cookie", sessionCookie(alan));
    const asAda = await request(app)
      .get("/Collections/likes")
      .set("Cookie", sessionCookie(ada));

    expect(asAlan.body[0]).toMatchObject({ likes: 3, likedByMe: true, mine: false });
    expect(asAda.body[0]).toMatchObject({ likes: 3, likedByMe: false, mine: true });
  });

  // Only the count: never who liked a sentence, nor its text or author
  it("sends exactly the contract's fields", async () => {
    const { alan, sentence } = await setUp();
    await Sentence.updateOne({ _id: sentence._id }, { $set: { likedBy: [alan._id] } });

    const res = await request(app)
      .get("/Collections/likes")
      .set("Cookie", sessionCookie(alan));

    expect(fieldsOf(res.body[0])).toEqual(["_id", "likedByMe", "likes", "mine"]);
  });

  it("gives a sentence its first like when an admin approves it", async () => {
    const ada = await createUser();
    const admin = await createAdmin();
    const sentence = await createSentence(ada);

    const before = await request(app)
      .get("/Collections/likes")
      .set("Cookie", sessionCookie(ada));
    expect(before.body).toEqual([]);

    await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: { _id: String(sentence._id) } });

    const after = await request(app)
      .get("/Collections/likes")
      .set("Cookie", sessionCookie(ada));
    expect(after.body).toStrictEqual([
      { _id: String(sentence._id), likes: 1, likedByMe: false, mine: true },
    ]);
  });
});

describe("editing a liked sentence", () => {
  it("starts its likes again: the old ones were for the old text", async () => {
    const { ada, alan, sentence, path } = await setUp();
    const admin = await createAdmin();
    await request(app).put(path).set("Cookie", sessionCookie(alan));

    await request(app)
      .patch("/MyPage")
      .set("Cookie", sessionCookie(ada))
      .send({ title: sentence.title, show: "A completely new sentence." });
    await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ status: "approve", sentence: { _id: String(sentence._id) } });

    const res = await request(app)
      .get("/Collections/likes")
      .set("Cookie", sessionCookie(alan));
    expect(res.body).toStrictEqual([
      { _id: String(sentence._id), likes: 1, likedByMe: false, mine: false },
    ]);
  });
});

describe("PUT /Collections/:id/like", () => {
  it("adds the user's like and sends back the sentence's likes", async () => {
    const { alan, sentence, path } = await setUp();

    const res = await request(app).put(path).set("Cookie", sessionCookie(alan));

    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      _id: String(sentence._id),
      likes: 2,
      likedByMe: true,
      mine: false,
    });
  });

  it("counts each student once, however often they like it", async () => {
    const { alan, path } = await setUp();
    const cookie = sessionCookie(alan);

    await request(app).put(path).set("Cookie", cookie);
    const again = await request(app).put(path).set("Cookie", cookie);
    // Two at the same moment (a double click) count once too
    await Promise.all([
      request(app).put(path).set("Cookie", cookie),
      request(app).put(path).set("Cookie", cookie),
    ]);

    expect(again.status).toBe(200);
    expect(again.body.likes).toBe(2);
    const stored = await Sentence.findOne({}).orFail();
    expect(stored.likedBy.map(String)).toEqual([String(alan._id)]);
  });

  it("counts different students' likes separately", async () => {
    const { alan, path } = await setUp();
    const carol = await otherUser(3);

    await request(app).put(path).set("Cookie", sessionCookie(alan));
    const res = await request(app).put(path).set("Cookie", sessionCookie(carol));

    expect(res.body.likes).toBe(3);
  });

  it("lets admins like sentences too", async () => {
    const { path } = await setUp();
    const admin = await createAdmin();

    const res = await request(app).put(path).set("Cookie", sessionCookie(admin));

    expect(res.status).toBe(200);
    expect(res.body.likes).toBe(2);
  });

  it("refuses a like on the user's own sentence (403)", async () => {
    const { ada, path } = await setUp();

    const res = await request(app).put(path).set("Cookie", sessionCookie(ada));

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("You can't like your own sentence");
    const stored = await Sentence.findOne({}).orFail();
    expect(stored.likedBy).toHaveLength(0);
  });

  it.each([
    ["waiting for review", {}],
    ["sent back for a redo", { toRedo: true }],
  ])("refuses a sentence %s (404), which isn't on Collections", async (_, state) => {
    const ada = await createUser();
    const alan = await otherUser();
    const sentence = await createSentence(ada, state);

    const res = await request(app)
      .put(`/Collections/${sentence._id}/like`)
      .set("Cookie", sessionCookie(alan));

    expect(res.status).toBe(404);
    const stored = await Sentence.findById(sentence._id).orFail();
    expect(stored.likedBy).toHaveLength(0);
  });

  it("answers 404 for a sentence that doesn't exist", async () => {
    const alan = await otherUser();

    const res = await request(app)
      .put(`/Collections/${new mongoose.Types.ObjectId()}/like`)
      .set("Cookie", sessionCookie(alan));

    expect(res.status).toBe(404);
  });

  it.each(["not-an-id", "0123456789abcdef0123456", '{"$ne":null}'])(
    "refuses %s as a sentence id (400)",
    async (id) => {
      const alan = await otherUser();

      const res = await request(app)
        .put(`/Collections/${encodeURIComponent(id)}/like`)
        .set("Cookie", sessionCookie(alan));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid sentence id");
    }
  );
});

describe("DELETE /Collections/:id/like", () => {
  it("takes back the user's like, and only theirs", async () => {
    const { alan, path } = await setUp();
    const carol = await otherUser(3);
    await request(app).put(path).set("Cookie", sessionCookie(alan));
    await request(app).put(path).set("Cookie", sessionCookie(carol));

    const res = await request(app).delete(path).set("Cookie", sessionCookie(alan));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ likes: 2, likedByMe: false });
    const stored = await Sentence.findOne({}).orFail();
    expect(stored.likedBy.map(String)).toEqual([String(carol._id)]);
  });

  it("never takes away the like for passing review", async () => {
    const { alan, ada, path } = await setUp();

    // Unliking a sentence they never liked, or their own, changes nothing
    const notLiked = await request(app).delete(path).set("Cookie", sessionCookie(alan));
    const own = await request(app).delete(path).set("Cookie", sessionCookie(ada));

    expect(notLiked.status).toBe(200);
    expect(notLiked.body.likes).toBe(1);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ likes: 1, mine: true });
  });

  it("refuses a sentence that isn't approved (404)", async () => {
    const ada = await createUser();
    const alan = await otherUser();
    const sentence = await createSentence(ada);

    const res = await request(app)
      .delete(`/Collections/${sentence._id}/like`)
      .set("Cookie", sessionCookie(alan));

    expect(res.status).toBe(404);
  });

  it("refuses an id that isn't one (400)", async () => {
    const alan = await otherUser();

    const res = await request(app)
      .delete("/Collections/nope/like")
      .set("Cookie", sessionCookie(alan));

    expect(res.status).toBe(400);
  });
});
