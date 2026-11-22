import { describe, expect, it } from "vitest";
import { askOf, classicId, hasIds, hintFor, tellById, withoutAsk } from "./tells";
import type { TellSentence } from "./api/types";

const tell = (id: string, words: string): TellSentence => ({
  key: 1,
  id,
  technique: "senses",
  title: "Day",
  tell: words,
  image: `/${id}.jpg`,
});

describe("tellById", () => {
  it("finds a Tell by its id, wherever it is in the list", () => {
    const tells = [tell("day2", "Two"), tell("t-snow", "Snow"), tell("day1", "One")];
    expect(tellById(tells, "day1")?.tell).toBe("One");
    expect(tellById(tells, "t-snow")?.tell).toBe("Snow");
    expect(tellById(tells, "day3")).toBeUndefined();
    expect(tellById(tells, undefined)).toBeUndefined();
  });

  it("names Classic's days the way sentences do", () => {
    expect(classicId(7)).toBe("day7");
  });
});

describe("hasIds", () => {
  it("is false for a list saved before Tells had ids, or no list", () => {
    expect(hasIds([{ key: 1, title: "Day 1", tell: "It is cold outside.", image: "/x.jpg" }])).toBe(false);
    expect(hasIds([])).toBe(false);
    expect(hasIds([tell("day1", "One")])).toBe(true);
  });
});

describe("withoutAsk", () => {
  it.each([
    ["He dodged all the traps with ease. (Use a Simile)", "He dodged all the traps with ease."],
    ["The hot soup burned my mouth. (Use a Metaphor)", "The hot soup burned my mouth."],
    ["The gale blew the flowers back and forth. (Use Personification)", "The gale blew the flowers back and forth."],
    ["My mom is weak in the knee whenever she sees a mouse. (Use an Allusion)", "My mom is weak in the knee whenever she sees a mouse."],
  ])("takes the ask off %s", (words, shown) => {
    expect(withoutAsk(words)).toBe(shown);
  });

  it("leaves other Tells alone", () => {
    expect(withoutAsk("It is cold outside.")).toBe("It is cold outside.");
    expect(withoutAsk("Describe Pikachu.")).toBe("Describe Pikachu.");
  });
});

describe("askOf", () => {
  it("says what a Tell asks for, and nothing for the senses", () => {
    expect(askOf("simile")).toBe("This Tell asks for a simile");
    expect(askOf("allusion")).toBe("This Tell asks for an allusion");
    expect(askOf("personification")).toBe("This Tell asks for personification");
    expect(askOf("senses")).toBeNull();
    expect(askOf(undefined)).toBeNull();
  });
});

describe("hintFor", () => {
  it("asks for the senses, or for what the Tell asks for", () => {
    expect(hintFor("senses")).toBe("Show it with what you see, hear and feel.");
    expect(hintFor(undefined)).toBe("Show it with what you see, hear and feel.");
    expect(hintFor("simile")).toBe("Show it with a simile.");
    expect(hintFor("allusion")).toBe("Show it with an allusion.");
  });
});
