import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";

// What the site says has to be true. There is no class and no personal
// teacher: one reviewer reads every sentence as Scribbles (a Show ME teacher
// today, the AI teacher later). The gallery holds everyone's approved
// sentences. And there is no daily limit: "your next Tell" is just the next
// one. This keeps the old, misleading wording from creeping back into
// anything the site shows.
const MISLEADING = [
  /your teacher/i,
  /class gallery/i,
  /the class made/i,
  /classmate/i,
  /today'?s tell/i,
  /today(&apos;|')s sentence/i,
  /every day brings/i,
  /back to today/i,
  /show and tell/i,
];

// The app's own files, as written, without the tests
const sources = import.meta.glob(["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}", "!./test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Comments are for developers, not visitors; drop them before looking
const withoutComments = (code: string) =>
  code.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the site's wording", () => {
  it("finds the app's files to check", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it.each(MISLEADING.map((pattern) => [String(pattern), pattern] as const))(
    "never says %s",
    (_name, pattern) => {
      const found = Object.entries(sources)
        .filter(([, code]) => pattern.test(withoutComments(code)))
        .map(([file]) => file);
      if (pattern.test(indexHtml)) found.push("index.html");
      expect(found).toEqual([]);
    }
  );
});
