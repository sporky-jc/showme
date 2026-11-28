import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { ReviewLine, hashShow } from "../models/reviewLine.js";
import { HostedUsage } from "../models/hostedUsage.js";
import { setSuggestionSource } from "../models/reviewerSwitch.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { lineSuggestion, splitModel, type LineRecord } from "../reviewer/lineSuggestion.js";
import { createAdmin, createSentence, createUser, sessionCookie } from "./helpers.js";

// The review line's suggestions on the Teacher page
// (spec/SPEC-teacher-suggestions.md). Made-up sentences and models only.

const PASS = { outcome: "pass" } as const;
const OK = { suitable: "yes", onTopic: "yes", technique: "yes", shows: "yes", detail: "see", grammar: "yes" };
const at = new Date();
const answer = (reader: string, question: string, model: string, value: unknown) => ({ reader, question, model, answer: value, at });
const decided = (step: Record<string, string>, answers: LineRecord["answers"] = []): LineRecord => ({ state: "decided", decided: step as LineRecord["decided"], answers });

const LOCAL = [
  answer("safety", "safety", "llama-guard3:8b@46f211c3d866", "safe"),
  answer("first", "welfare", "gemma4:e4b@dc35e8d9c606", "no"),
  answer("first", "checklist", "gemma4:e4b@dc35e8d9c606", OK),
  answer("second", "welfare", "qwen3.5:9b@56671c2ab938", "no"),
];

describe("a line record as a card's suggestion", () => {
  it.each([
    ["approve", { step: "approve", tip: "great" }, { verdict: "approve", tip: "great", reasons: ["ai"] }],
    ["approve, with a note", { step: "approve", tip: "great", teacher: "review" }, { verdict: "approve", teacher: "review" }],
    ["send back", { step: "send-back", tip: "smell", check: "shows" }, { verdict: "redo", tip: "smell", reasons: ["ai"] }],
    ["send back, with a note", { step: "send-back", tip: "kindWords", check: "gallery", teacher: "worry" }, { verdict: "redo", tip: "kindWords", teacher: "worry" }],
    ["worrying words", { step: "teacher", because: "worrying-words" }, { verdict: "unsure", tip: null, reasons: ["worrying"] }],
    ["a worry", { step: "teacher", because: "worry" }, { verdict: "unsure", reasons: ["worrying", "welfare-check"] }],
    ["a worry not checked in time", { step: "teacher", because: "worry-not-checked" }, { verdict: "unsure", reasons: ["worrying", "welfare-check"] }],
    ["anything else for a teacher", { step: "teacher", because: "model-failed" }, { verdict: "unsure", reasons: ["ai"] }],
  ])("%s", (_, step, expected) => {
    const suggestion = lineSuggestion(decided(step, LOCAL), PASS);
    expect(suggestion).toMatchObject(expected);
    expect(suggestion.waiting).toBeUndefined();
  });

  it("still being read: waiting, with what's answered so far", () => {
    const suggestion = lineSuggestion({ state: "waiting", answers: LOCAL.slice(0, 2) }, PASS);
    expect(suggestion).toMatchObject({ verdict: "unsure", waiting: true });
    expect(suggestion.trail.map((s) => s.check)).toEqual(["words", "safety", "helper"]);
  });

  it("names each model and version from its saved answer, whatever it is", () => {
    const { trail } = lineSuggestion(
      decided({ step: "teacher", because: "worry" }, [
        ...LOCAL,
        answer("first", "welfare", "some-new-model:3b@0123456789ab", "yes"),
        answer("hosted", "welfare", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "yes"),
      ]),
      PASS,
      1
    );
    expect(trail).toEqual([
      { check: "words", question: "rules", said: "nothing-found", why: false },
      { check: "safety", question: "safety", said: "safe", model: "llama-guard3:8b", version: "46f211c3", why: false },
      // The latest answer to each question counts
      { check: "helper", question: "welfare", said: "worried", model: "some-new-model:3b", version: "01234567", why: true },
      { check: "helper", question: "checklist", said: "all-good", model: "gemma4:e4b", version: "dc35e8d9", why: false },
      { check: "helper", question: "welfare", said: "not-worried", model: "qwen3.5:9b", version: "56671c2a", why: false },
      { check: "big-helper", question: "welfare", said: "worried", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", hidden: 1, why: true },
    ]);
  });

  it("marks what put it here: the word check, or the checklist that found the problem", () => {
    const held = lineSuggestion(decided({ step: "teacher", because: "worrying-words" }), { outcome: "hold", reasons: ["worrying"] });
    expect(held.trail).toEqual([{ check: "words", question: "rules", said: "held", found: ["worrying"], why: true }]);

    const writing = lineSuggestion(
      decided({ step: "send-back", tip: "smell", check: "shows" }, [...LOCAL, answer("second", "checklist", "qwen3.5:9b@56671c2ab938", { ...OK, shows: "no" })]),
      PASS
    );
    expect(writing.trail.filter((s) => s.why)).toEqual([
      { check: "helper", question: "checklist", said: "found-problems", found: ["shows"], model: "qwen3.5:9b", version: "56671c2a", why: true },
    ]);
  });

  it("splits a model into its name and short version", () => {
    expect(splitModel("gemma4:e4b@dc35e8d9c606")).toEqual({ model: "gemma4:e4b", version: "dc35e8d9" });
    expect(splitModel("@cf/meta/llama-3.3-70b-instruct-fp8-fast")).toEqual({ model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" });
  });
});

describe("the Teacher page with the line as the source", () => {
  afterEach(() => vi.unstubAllEnvs());

  const queueFor = async (admin: { id: string }) => (await request(app).get("/Admin").set("Cookie", sessionCookie(admin))).body;

  it("shows the old reviewer's suggestions by default, and the line's when chosen, only for the current words", async () => {
    const admin = await createAdmin();
    const student = await createUser({ id: "google-student", email: "s@example.com" });
    const sentence = await createSentence(student, { show: "Clothes carpeted the floor like a soft, lumpy rug." });
    await ReviewSuggestion.create({ sentence: sentence._id, show: sentence.show, verdict: "redo", tip: "smell", reasons: ["ai"], decidedBy: "ai" });
    const line = await ReviewLine.create({
      sentence: sentence._id,
      showHash: hashShow(sentence.show),
      state: "decided",
      decided: { step: "approve", tip: "great" },
      answers: LOCAL.map((a) => ({ ...a, questionVersion: "q" })),
    });
    await HostedUsage.create({ at, about: "worry", kid: "k", line: line._id, hidden: 0 });

    // The deploy's default: the old reviewer
    expect((await queueFor(admin))[0].suggestion).toMatchObject({ verdict: "redo" });

    // The Teacher page's switch: the line
    await setSuggestionSource("line");
    const [card] = await queueFor(admin);
    expect(card.suggestion).toMatchObject({ verdict: "approve", tip: { id: "great" } });
    expect(card.suggestion.trail[1]).toMatchObject({ check: "safety", model: "llama-guard3:8b", version: "46f211c3" });

    // Back to the default; and the default set to the line by the deploy
    await setSuggestionSource("default");
    expect((await queueFor(admin))[0].suggestion).toMatchObject({ verdict: "redo" });
    vi.stubEnv("SUGGESTIONS_FROM", "line");
    expect((await queueFor(admin))[0].suggestion).toMatchObject({ verdict: "approve" });

    // Words the student has since changed: no suggestion from the line
    await ReviewLine.updateOne({ _id: line._id }, { $set: { showHash: "other words" } });
    expect((await queueFor(admin))[0].suggestion).toBeUndefined();
  });

  it("counts the line's worries for the badge when it's the source", async () => {
    vi.stubEnv("SUGGESTIONS_FROM", "line");
    const admin = await createAdmin();
    const student = await createUser({ id: "google-student", email: "s@example.com" });
    const sentence = await createSentence(student, { show: "I feel sad at home." });
    await ReviewLine.create({ sentence: sentence._id, showHash: hashShow(sentence.show), state: "decided", decided: { step: "teacher", because: "worry" } });
    const res = await request(app).get("/Admin/count").set("Cookie", sessionCookie(admin));
    expect(res.body).toEqual({ checkIn: 1, waiting: 1 });
  });
});
