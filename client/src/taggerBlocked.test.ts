import { describe, expect, it } from "vitest";
import { FEELING_WORDS, NEVER_ADD, TELLING_WORDS } from "../../backend/tagger/blocked";
import { FEELING_WORDS as JOB_FEELINGS, NEVER_ADD as JOB_NEVER_ADD } from "../scripts/senseWordJob";
import { TELL_WORDS, senseWords } from "./senses";

// The backend's sense tagger can't import the website's code, so it keeps
// copies of the lists of words it never lights up (backend/tagger/blocked.ts).
// This keeps them the same.

const sorted = (words: Iterable<string>) => [...words].sort();

describe("the sense tagger's blocked words", () => {
  it("has the weekly word job's feelings words and NEVER_ADD", () => {
    expect(sorted(FEELING_WORDS)).toEqual(sorted(JOB_FEELINGS));
    expect(sorted(NEVER_ADD)).toEqual(sorted(JOB_NEVER_ADD));
  });

  it("has the telling words, less the ones that are sense words too", () => {
    const telling = [...TELL_WORDS].filter((word) => Object.values(senseWords(word)).every((found) => found === null));
    expect(sorted(TELLING_WORDS)).toEqual(sorted(telling));
  });
});
