import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SENSE_KEYS, type SenseKey, senseWords } from "./senses";
import { SENSE_WORDS_BEFORE } from "./test/sensesBefore";

// Word families (S1 of tasks/sense-words-plan.md): the list keeps base words,
// and senses.ts works out their forms.

const sensesOf = (word: string) => SENSE_KEYS.filter((sense) => senseWords(word)[sense] === word);

describe("word families", () => {
  it("still matches every word the old list matched, for the same sense", () => {
    const lost: string[] = [];
    for (const sense of SENSE_KEYS) {
      const { words, starts } = SENSE_WORDS_BEFORE[sense];
      // A word start matched any word beginning with it: try a few
      const samples = [...words, ...starts.flatMap((start) => [start + "e", start + "ed", start + "ing", start + "y"])];
      for (const word of samples) if (!sensesOf(word).includes(sense)) lost.push(`${sense}: ${word}`);
    }
    expect(lost).toEqual([]);
  });

  it.each<[string, SenseKey]>([
    ["screams", "hear"],
    ["screamed", "hear"],
    ["screaming", "hear"],
    ["louder", "hear"],
    ["loudest", "hear"],
    ["loudly", "hear"],
    ["noisily", "hear"],
    ["roaring", "hear"],
    ["snoring", "hear"],
    ["whining", "hear"],
    ["hummed", "hear"],
    ["crashes", "hear"],
    ["sobbing", "hear"],
    ["shining", "see"],
    ["stared", "see"],
    ["paler", "see"],
    ["brightly", "see"],
    ["dimmed", "see"],
    ["trembling", "feel"],
    ["hotter", "feel"],
    ["softly", "feel"],
    ["drier", "feel"],
    ["hugging", "feel"],
    ["smoking", "smell"],
    ["stinks", "smell"],
    ["tasted", "taste"],
    ["tastier", "taste"],
    ["biting", "taste"],
    ["sweeter", "taste"],
  ])("finds %s as a form of a %s word", (word, sense) => {
    expect(sensesOf(word)).toContain(sense);
  });

  it.each([
    // Look like a form of a sense word, but aren't one
    "pants", // pant
    "seed", // see
    "has", // ha
    "singer", // sing: -er is for describing words only
    "drummer", // drum
    "power", // pow
    "human", // hum
    "mood", // moo
    "heed", // hee
    "thing",
    "string",
    "only",
    "forest",
    "seemed",
    "feeling", // how someone feels inside, more often than touch
    "feels",
    "tired",
    "bored",
    "furious",
  ])("finds no sense in %s", (word) => {
    expect(sensesOf(word)).toEqual([]);
  });

  it("finds nothing in sentences that only tell", () => {
    const telling = [
      "The party was fun.",
      "She was very happy.",
      "It was a great day at the beach.",
      "His room is messy.",
      "The house is very small.",
      "My dog is scared of storms.",
      "We were tired after the game.",
      "He was mad at his brother.",
      "The test was really hard.",
      "I was nervous before the show.",
      "My friend was excited about her birthday.",
      "The movie was boring.",
      "He is late, and his train just left.",
      "Our teacher was proud of us.",
      "The puppy was cute and tiny.",
      "Grandma is very kind.",
      "The plants were growing fast.",
      "I was bored at home all summer.",
      "The singer was famous.",
      "She was the best player on the team.",
    ];
    const lit = telling.filter((sentence) => Object.values(senseWords(sentence)).some((word) => word !== null));
    expect(lit).toEqual([]);
  });
});

// Scribbles' sound words (backend/reviewer/soundWords.ts): each one is a Hear
// word here, or is listed below with why it isn't.
const NOT_HEAR = {
  // How someone feels, more than a sound you hear
  feelings: [
    "aah", "ahh", "argh", "aw", "aww", "eek", "eep", "ew", "eww", "hm", "hmm", "mm", "oof", "ooh",
    "oops", "ouch", "ow", "phew", "pff", "tsk", "ugh", "uh", "um", "whew", "whoa", "wow", "yay",
    "yikes", "yippee", "yuck", "brr",
  ],
  // Another sense's word
  otherSenses: ["gulp", "munch", "nom", "slurp", "yum", "sniff", "squish"],
  // Usually a movement or an action, not a sound
  movements: [
    "bash", "chug", "drip", "drop", "flip", "flop", "puff", "tap", "yawn", "zag", "zap", "zig",
    "zing", "zip", "zoom",
  ],
};

describe("Scribbles' sound words", () => {
  it("are all Hear words, except the ones that aren't a sound", () => {
    const source = readFileSync(resolve(process.cwd(), "../backend/reviewer/soundWords.ts"), "utf8");
    const set = source.slice(source.indexOf("new Set(["));
    const words = [...set.matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
    expect(words.length).toBeGreaterThan(100);
    const skipped = new Set(Object.values(NOT_HEAR).flat());
    const missing = words.filter((word) => !skipped.has(word) && !sensesOf(word).includes("hear"));
    expect(missing).toEqual([]);
  });
});
