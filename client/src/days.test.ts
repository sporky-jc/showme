import { describe, expect, it } from "vitest";
import { dayOf, nextDay } from "./days";

const titled = (...titles: string[]) => titles.map((title) => ({ title }));

describe("dayOf", () => {
  it("reads the day from a day's title", () => {
    expect(dayOf("day1")).toBe(1);
    expect(dayOf("day35")).toBe(35);
  });

  it.each(["Day 1", "day0", "day01", "day", "", "The room was messy.", " day1"])(
    "finds no day in %j",
    (title) => expect(dayOf(title)).toBeUndefined()
  );
});

describe("nextDay", () => {
  it("is day 1 for a student who hasn't written yet", () => {
    expect(nextDay([], 35)).toBe(1);
  });

  it("is the day after the latest, past any gap", () => {
    expect(nextDay(titled("day1", "day3"), 35)).toBe(4);
  });

  // The staging demo account (backend/utils/sampleData.ts), in any order
  it("is the day after the latest for a list with many gaps, in any order", () => {
    expect(nextDay(titled("day25", "day13", "day18", "day20", "day21", "day22", "day23"), 35)).toBe(26);
  });

  it("doesn't skip a day for two sentences on one day", () => {
    expect(nextDay(titled("day1", "day2", "day2"), 35)).toBe(3);
  });

  it("leaves out titles that aren't days", () => {
    expect(nextDay(titled("Day 1", "The room was messy.", "day2"), 35)).toBe(3);
    expect(nextDay(titled("Day 1"), 35)).toBe(1);
  });

  it("is none once the last day is written: all done", () => {
    const all = Array.from({ length: 35 }, (_, i) => `day${i + 1}`);
    expect(nextDay(titled(...all), 35)).toBeUndefined();
    expect(nextDay(titled("day35"), 35)).toBeUndefined();
    expect(nextDay(titled("day34"), 35)).toBe(35);
  });

  it("is none for a day past the end of the list", () => {
    expect(nextDay(titled("day40"), 35)).toBeUndefined();
  });
});
