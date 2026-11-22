import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { TECHNIQUES } from "../contract/api.js";
import tellList, { tellForTitle } from "../public/tellList.js";

// The Classic path is frozen: students have written for every one of these
// Tells, and each sentence names its Tell by id ("day1".."day35"). Changing
// an id, the order or the words would change old sentences' Tells, their
// gallery photos and the next Tell students get. Add new Tells with new ids
// instead (see tasks/plan.md).
const CLASSIC = [
  "It is cold outside.",
  "It is hot outside.",
  "His room is messy.",
  "Her room is clean.",
  "The house is super big.",
  "The house is very small.",
  "The party was fun.",
  "That class was boring.",
  "I am so tired.",
  "I can't fall asleep.",
  "The king is rich.",
  "The students were very loud, and the teacher couldn't do anything about it.",
  "He is late, and his train just left.",
  "She almost drowned in the pool.",
  "Describe Godzilla.",
  "Describe Pikachu.",
  "The car is super fast.",
  "It rained a lot this weekend.",
  "The movie scared the little boy.",
  "The meal was delicious.",
  "Our lunch was gross.",
  "We can not see anything in this fog.",
  "The plants were colorful.",
  "My leg hurts.",
  "It was dark outside.",
  "This test is hard.",
  "Describe your perfect pet.",
  "The flood was devastating.",
  "Fourth of July was great.",
  "Describe your favorite pastime.",
  "He dodged all the traps with ease. (Use a Simile)",
  "The hot soup burned my mouth. (Use a Metaphor)",
  "The gale blew the flowers back and forth. (Use Personification)",
  "I lost my bike, and I got an F on my math test. (Use Hyperbole)",
  "My mom is weak in the knee whenever she sees a mouse. (Use an Allusion)",
];

describe("the Classic Tell list", () => {
  it("keeps all 35 Tells, in the same order, with the same words", () => {
    expect(tellList.map((tell) => tell.tell)).toEqual(CLASSIC);
  });

  it("names each Tell by its day, as students' sentences already do", () => {
    expect(tellList.map((tell) => tell.id)).toEqual(CLASSIC.map((_, i) => `day${i + 1}`));
    expect(tellList.map((tell) => tell.key)).toEqual(CLASSIC.map((_, i) => i + 1));
  });

  it("asks for the senses on Days 1-30, and for the figure of speech its words name after", () => {
    expect(tellList.slice(0, 30).every((tell) => tell.technique === "senses")).toBe(true);
    expect(tellList.slice(30).map((tell) => tell.technique)).toEqual([
      "simile",
      "metaphor",
      "personification",
      "hyperbole",
      "allusion",
    ]);
  });

  it("tags every Tell with a technique the website knows", () => {
    for (const tell of tellList) expect(TECHNIQUES).toContain(tell.technique);
  });
});

describe("tellForTitle", () => {
  it("finds a Tell by its id", () => {
    expect(tellForTitle("day1")).toBe(CLASSIC[0]);
    expect(tellForTitle("day35")).toBe(CLASSIC[34]);
  });

  it("finds nothing for a title that isn't a Tell's id", () => {
    for (const title of ["day0", "day36", "day01", "Day 1", "The room was messy.", ""]) {
      expect(tellForTitle(title)).toBeUndefined();
    }
  });
});

describe("GET /", () => {
  it("sends each Tell's id and technique", async () => {
    const res = await request(app).get("/");
    expect(res.body[0]).toMatchObject({ id: "day1", technique: "senses" });
    expect(res.body[30]).toMatchObject({ id: "day31", technique: "simile" });
  });
});
