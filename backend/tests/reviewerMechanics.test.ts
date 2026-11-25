import { describe, expect, it } from "vitest";
import { mechanicsIssues } from "../reviewer/mechanics.js";
import { reviewSentence, type ReviewProvider, type SafetyCheck, type WelfareCheck } from "../reviewer/reviewer.js";
import { REVIEW_INSTRUCTIONS } from "../reviewer/prompt.js";
import { TIPS } from "../reviewer/tips.js";

// Capitals, end marks and punctuation: a sentence with them is never
// approved into the gallery

const COLD = "It is cold outside.";
const safety: SafetyCheck = { name: "guard", check: async () => "safe" };
// The welfare check, seeing nothing worrying
const welfare: WelfareCheck = { name: "welfare", check: async () => ({ concern: "no" }) };
const approving: ReviewProvider = { name: "ai", review: async () => ({ verdict: "approve", tip: "great" }) };

describe("the capitals and punctuation checks", () => {
  it.each([
    ["my breath puffed out.", [{ kind: "capital-start", text: "my" }]],
    ["\"brrr,\" I said.", [{ kind: "capital-start", text: "\"brrr,\"" }]],
    ["When i stepped out, i'm cold.", [{ kind: "lowercase-i", text: "i" }, { kind: "lowercase-i", text: "i'm" }]],
    ["The grass crunched", [{ kind: "end-mark", text: "crunched" }]],
    ["It was cold ,so cold .", [{ kind: "space-before-mark", text: "cold ," }, { kind: "space-before-mark", text: "cold ." }]],
    ["It was cold,and wet.Then snow.", [{ kind: "no-space-after-mark", text: "cold,and" }, { kind: "no-space-after-mark", text: "wet.Then" }]],
    ["The the wind howled.", [{ kind: "repeated-word", text: "The the" }]],
    ["I ate a apple and an banana.", [{ kind: "a-an", text: "a apple" }, { kind: "a-an", text: "an banana" }]],
  ])("finds the mistakes in: %s", (show, issues) => {
    expect(mechanicsIssues(show)).toEqual(issues);
  });

  it.each([
    "My breath puffed out like a little cloud, and the frozen grass crunched under my boots.",
    "Crunch, crunch, went the snow under my boots!",
    "An hour passed, and a unicorn and a one-eyed cat walked by.",
    "3 dogs ran by, barking at the snowflakes.",
    "\"Brrr!\" I said, rubbing my hands.",
    "We left at 7 a.m. when it was 3.5 degrees, and about 1,000 flakes fell.",
    "Mr. Brown smiled…",
    "She shouted, \"Look at the snow!\"",
    "I saw a UFO and an elephant in the snowy field.",
    "Was it the wind, or was it a ghost?",
    "‘Woof!’ barked the dog, wagging his tail.",
    "'Stop!' shouted Mum, and the car screeched to a halt.",
    "‘Are you coming?’ asked Gran.",
    "‘Boom,’ went the drum, ‘boom, boom.’",
  ])("finds nothing in: %s", (show) => {
    expect(mechanicsIssues(show)).toEqual([]);
  });

  // Repeats a child means: sound words, and words said aloud
  it.each([
    "Crunch crunch went the snow.",
    "Drip, drip, drip went the icicles.",
    "Boom boom went the thunder.",
    "Grrrr grrrr went the dog.",
    "\"Help! Help!\" she cried.",
    "\"Help help!\" she cried.",
    "\"No no no,\" said Sam.",
    "“Go go go!” we shouted.",
  ])("finds no repeated word in: %s", (show) => {
    expect(mechanicsIssues(show)).toEqual([]);
  });

  it.each([
    ["The the snow fell.", "The the"],
    ["I went to to school.", "to to"],
    ["\"I want the the red one,\" said Sam.", "the the"],
    ["We said no no to the cold.", "no no"],
  ])("still finds an accidental repeat in: %s", (show, text) => {
    expect(mechanicsIssues(show)).toEqual([{ kind: "repeated-word", text }]);
  });

  it("has tips, and the AI is told to be strict about the writing and the topic", () => {
    expect(TIPS.capitals).toMatch(/capital/);
    expect(TIPS.endMark).toMatch(/period/);
    expect(TIPS.punctuation).toMatch(/commas/);
    expect(TIPS.onTopic).toMatch(/Tell/);
    expect(REVIEW_INSTRUCTIONS).toContain("correct grammar");
    expect(REVIEW_INSTRUCTIONS).toContain('"onTopic" if it doesn\'t show the Tell\'s idea');
  });
});

describe("the reviewer and the writing checks", () => {
  it.each([
    ["my breath puffed out like a little cloud.", "capitals", ["ai", "punctuation"]],
    ["My breath puffed out like a little cloud", "endMark", ["ai", "punctuation"]],
    ["My breath puffed out ,like a little cloud.", "punctuation", ["ai", "punctuation"]],
    ["My breath puffed out like a a little cloud.", "readAloud", ["ai", "grammar"]],
  ])("never approves %s: it's sent back with the %s tip", async (show, tip, reasons) => {
    const { suggestion } = await reviewSentence({ tell: COLD, show }, [approving], { safety, welfare });
    expect(suggestion).toMatchObject({ verdict: "redo", tip, reasons });
    expect(suggestion.mechanics?.length).toBeGreaterThan(0);
  });

  // A child fixes one thing per try, and has two: one tip for every kind of
  // mistake at once, not spelling, then the capital, then the period
  it("gives one tip for spelling, capitals and end marks together, and lists every mistake for the teacher", async () => {
    const { suggestion } = await reviewSentence({ tell: COLD, show: "my breth puffed out" }, [approving], { safety, welfare });
    expect(TIPS.checkWriting).toMatch(/spelling, capitals and punctuation/);
    expect(suggestion).toEqual({
      verdict: "redo",
      tip: "checkWriting",
      reasons: ["ai", "spelling", "punctuation"],
      decidedBy: "ai",
      misspelled: ["breth"],
      mechanics: [
        { kind: "capital-start", text: "my" },
        { kind: "end-mark", text: "out" },
      ],
    });
  });
});
