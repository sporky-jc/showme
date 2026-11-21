import { describe, expect, it } from "vitest";
import { misspelledWords } from "../reviewer/spelling.js";
import { reviewSentence, type ReviewProvider, type SafetyCheck, type WelfareCheck } from "../reviewer/reviewer.js";
import { REVIEW_INSTRUCTIONS } from "../reviewer/prompt.js";
import { TIPS } from "../reviewer/tips.js";

// Spelling: a sentence with mistakes is never approved into the gallery

const COLD = "It is cold outside.";
const safety: SafetyCheck = { name: "guard", check: async () => "safe" };
// The welfare check, seeing nothing worrying
const welfare: WelfareCheck = { name: "welfare", check: async () => ({ concern: "no" }) };
const answering = (answer: unknown): ReviewProvider => ({ name: "ai", review: async () => answer });

describe("the spelling check", () => {
  it.each([
    ["She jumpd up and down.", ["jumpd"]],
    ["The cafateria was lound.", ["cafateria", "lound"]],
    ["The sun was brite, brite and hot.", ["brite"]],
    ["teh snow fell", ["teh"]],
  ])("finds the misspelled words: %s", (show, words) => {
    expect(misspelledWords(show)).toEqual(words);
  });

  it.each([
    "My breath puffed out like a little cloud, and the frozen grass crunched under my boots.",
    "I couldn't feel my toes; they're icicles.",
    "Lily and Grandpa Joe played Minecraft by the fire.",
    "Brrrr, my teeth chattered. Wheee, down the hill!",
    "Ok, the snow went crunch, crunch, crunch.",
    "The Show sentence’s apostrophe isn’t a mistake.",
  ])("finds nothing in: %s", (show) => {
    expect(misspelledWords(show)).toEqual([]);
  });

  // British (and Australian, Canadian, New Zealand) spellings are right
  it.each([
    "My favourite colour is grey.",
    "The neighbours' theatre was in the centre of town.",
    "We organise our things before we realise it's time to go.",
    "We travelled a metre past the kerb on an aeroplane with Mum.",
    "My mum packed my pyjamas, the programme and her jewellery.",
    "The colourful catalogue was an honour for the defence team.",
    "The tyre went flat after maths.",
  ])("accepts British spelling: %s", (show) => {
    expect(misspelledWords(show)).toEqual([]);
  });

  // Sound words are what "Show, don't tell" asks for
  it.each([
    "Crunch crunch went the snow.",
    "Whoosh!",
    "Brrr, it was cold.",
    "Zzzz went my dad.",
    "Shhh, the baby is asleep.",
    "Ssssplash went the puddle.",
    "Grrrr went the dog.",
    "Mmmm, hot cocoa.",
    "Pitter-patter went the rain.",
    "Tick-tock, splish-splash, the hurly-burly of the storm.",
    "Drip, drip, drip went the icicles.",
    "Boom! Kaboom! Vroom went the snowplough.",
    "Achoo! Eek!",
    "It was sooooo cold.",
    "Nooooo, my snowman melted!",
  ])("accepts sound words: %s", (show) => {
    expect(misspelledWords(show)).toEqual([]);
  });

  it.each([
    ["I was late becuase my frend was wierd.", ["becuase", "frend", "wierd"]],
    ["He climed the hill.", ["climed"]],
    // Only looks stretched: neither "blorrp" nor "blorp" is a word
    ["The slime went blorrrp.", ["blorrrp"]],
    // Echoes, but neither half is a word
    ["The frog went zorp-zarp.", ["zorp", "zarp"]],
  ])("still finds the misspelled words: %s", (show, words) => {
    expect(misspelledWords(show)).toEqual(words);
  });

  it("has a tip, and the AI is told about spelling", () => {
    expect(TIPS.spelling).toMatch(/spelling/i);
    expect(REVIEW_INSTRUCTIONS).toContain("Every word is spelled correctly");
  });
});

describe("the reviewer and spelling", () => {
  it("never approves a sentence with a misspelled word: it's sent back with the spelling tip", async () => {
    const { suggestion } = await reviewSentence(
      { tell: COLD, show: "My breth puffed out like a little cloud." },
      [answering({ verdict: "approve", tip: "great" })],
      { safety, welfare }
    );
    expect(suggestion).toEqual({
      verdict: "redo",
      tip: "spelling",
      reasons: ["ai", "spelling"],
      decidedBy: "ai",
      misspelled: ["breth"],
    });
  });

  // The spelling is certain and quick to fix; the AI's tip can come on the
  // next try
  it("puts the spelling tip before the AI's own tip for a redo, and lists the words for the teacher", async () => {
    const { suggestion } = await reviewSentence(
      { tell: COLD, show: "The wind felt realy sharp on my face." },
      [answering({ verdict: "redo", tip: "senses" })],
      { safety, welfare }
    );
    expect(suggestion).toMatchObject({ verdict: "redo", tip: "spelling", misspelled: ["realy"] });
  });

  // ... unless the AI asks for a new sentence: the misspelled words are
  // about to go
  it.each(["onTopic", "ownWords"] as const)("keeps the AI's %s tip, which asks for a new sentence", async (tip) => {
    const { suggestion } = await reviewSentence(
      { tell: COLD, show: "The wind felt realy sharp on my face." },
      [answering({ verdict: "redo", tip })],
      { safety, welfare }
    );
    expect(suggestion).toMatchObject({ verdict: "redo", tip, reasons: ["ai", "spelling"], misspelled: ["realy"] });
  });

  it("lists the words when nobody could decide, and never sends it back", async () => {
    const { suggestion } = await reviewSentence({ tell: COLD, show: "My breth puffed out like a cloud." }, [], {});
    expect(suggestion).toMatchObject({ verdict: "unsure", misspelled: ["breth"] });
  });

  it("never turns a hold into a send-back: a misspelled worrying sentence still goes to a person", async () => {
    const { suggestion } = await reviewSentence(
      { tell: COLD, show: "Nobody loves me and I am so lonley in the cold." },
      [answering({ verdict: "approve", tip: "great" })],
      { safety, welfare }
    );
    expect(suggestion).toMatchObject({ verdict: "unsure", decidedBy: "rules" });
  });

  it("leaves a correctly spelled approval alone", async () => {
    const { suggestion } = await reviewSentence(
      { tell: COLD, show: "My breath puffed out like a little cloud." },
      [answering({ verdict: "approve", tip: "great" })],
      { safety, welfare }
    );
    expect(suggestion).toEqual({ verdict: "approve", tip: "great", reasons: ["ai"], decidedBy: "ai" });
  });
});
