import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { REFRESHER_WRITES_PER_MINUTE } from "../middlewares/rateLimit.js";
import Profile from "../models/profile.js";
import { createUser, sessionCookie } from "./helpers.js";

// PUT /Login/refreshers/:technique: the student has seen a refresher, so it
// opens by itself only once. Kept on the profile, not in the browser:
// students share school devices.

const seen = (user: Parameters<typeof sessionCookie>[0], technique: string) =>
  request(app).put(`/Login/refreshers/${technique}`).set("Cookie", sessionCookie(user));

describe("seen refreshers", () => {
  it("needs a login", async () => {
    expect((await request(app).put("/Login/refreshers/simile")).status).toBe(401);
  });

  it("starts with none seen, also for profiles from before they existed", async () => {
    const ada = await createUser();
    await Profile.collection.updateOne({ _id: ada._id }, { $unset: { seenRefreshers: "" } });

    const res = await request(app).get("/Login").set("Cookie", sessionCookie(ada));

    expect(res.status).toBe(200);
    expect(res.body.seenRefreshers).toEqual([]);
  });

  it("remembers each one once, and sends the student back", async () => {
    const ada = await createUser();

    await seen(ada, "senses");
    await seen(ada, "simile");
    const res = await seen(ada, "senses");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: "Ada", seenRefreshers: ["senses", "simile"] });
    const login = await request(app).get("/Login").set("Cookie", sessionCookie(ada));
    expect(login.body.seenRefreshers).toEqual(["senses", "simile"]);
  });

  it("only changes the signed-in student's own profile", async () => {
    const ada = await createUser();
    const alan = await createUser({ id: "google-user-2", firstName: "Alan", email: "alan@example.com" });

    await seen(ada, "simile");

    expect((await Profile.findById(alan._id))?.toObject().seenRefreshers).toEqual([]);
  });

  it.each(["rhyme", "SIMILE", "%24ne", "constructor"])("refuses a technique that isn't one: %s", async (technique) => {
    const ada = await createUser();

    const res = await seen(ada, technique);

    expect(res.status).toBe(400);
    expect((await Profile.findById(ada._id))?.toObject().seenRefreshers).toEqual([]);
  });

  it("limits how many a student marks in a minute", async () => {
    const ada = await createUser();
    for (let i = 0; i < REFRESHER_WRITES_PER_MINUTE; i++) {
      expect((await seen(ada, "simile")).status).toBe(200);
    }
    expect((await seen(ada, "simile")).status).toBe(429);
  });
});
