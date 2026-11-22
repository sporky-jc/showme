import { afterEach, describe, expect, it, vi } from "vitest";
import { Sentence } from "../models/sentences.js";
import { ProviderError } from "../reviewer/providers/http.js";
import { TEST_ACCOUNT_PREFIX } from "../config/testAccounts.js";
import { agreedTags, readTags, type SenseKey } from "../tagger/senseTags.js";
import { blockedWord } from "../tagger/blocked.js";
import { TAG_MODELS, neuronsFor, tagShow } from "../tagger/tagger.js";
import { TAGS_PER_RUN, tagApprovedSentences } from "../tagger/queue.js";
import { taggerSetup } from "../tagger/settings.js";
import { createUser } from "./helpers.js";

// The sense tagger (Stage A of tasks/sense-words-plan.md): two models read
// an approved sentence, and only the words both give the same sense light
// up. With stand-in answers: no real request is sent.

const SHOW = "Wind wailed through the trees and the bark felt rough.";
const tags = (entries: [string, SenseKey][]) => new Map(entries);

describe("readTags", () => {
  it("keeps the sentence's own words with a sense, once each", () => {
    const read = readTags(
      {
        words: [
          { word: "Wailed", sense: "hear" },
          { word: "wailed", sense: "see" }, // a second answer: the first counts
          { word: "howled", sense: "hear" }, // not in the sentence
          { word: "felt rough", sense: "feel" }, // a phrase
          { word: "rough", sense: "touch" }, // not a sense
          { word: "bark", sense: "feel" },
        ],
      },
      SHOW
    );
    expect([...(read ?? [])]).toEqual([
      ["wailed", "hear"],
      ["bark", "feel"],
    ]);
  });

  it("reads JSON text leniently, as a model told to answer in JSON writes it", () => {
    const read = readTags('Sure!\n```json\n{"words": [{"word": "rough", "sense": "feel"}]}\n```', SHOW);
    expect([...(read ?? [])]).toEqual([["rough", "feel"]]);
  });

  it("is empty for no sense words, and null for an answer it can't read", () => {
    expect(readTags({ words: [] }, SHOW)?.size).toBe(0);
    expect(readTags("I can't help with that.", SHOW)).toBeNull();
    expect(readTags({ answer: "hear" }, SHOW)).toBeNull();
  });
});

describe("agreedTags", () => {
  it("lights only the words both models give the same sense, in sentence order", () => {
    const first = tags([
      ["wailed", "hear"],
      ["bark", "feel"],
      ["rough", "feel"],
    ]);
    const second = tags([
      ["rough", "feel"],
      ["wailed", "hear"],
      ["trees", "see"],
      ["bark", "see"],
    ]);
    expect(agreedTags(SHOW, first, second)).toEqual([
      { word: "wailed", sense: "hear" },
      { word: "rough", sense: "feel" },
    ]);
  });

  it("never lights a feeling, a telling word or a NEVER_ADD word, even when both agree", () => {
    const show = "I felt proud, the pie was delicious, and my feelings were sweet.";
    const both = tags([
      ["proud", "feel"],
      ["delicious", "taste"],
      ["feelings", "feel"],
      ["sweet", "taste"],
    ]);
    expect(agreedTags(show, both, both)).toEqual([{ word: "sweet", sense: "taste" }]);
  });
});

describe("blockedWord", () => {
  it("blocks the lists' words and their forms, and nothing else", () => {
    for (const word of ["proud", "prouder", "nervously", "happily", "feelings", "lights", "Delicious"]) {
      expect([word, blockedWord(word)]).toEqual([word, true]);
    }
    for (const word of ["felt", "cold", "loud", "dark", "wailed", "rough", "sweet"]) {
      expect([word, blockedWord(word)]).toEqual([word, false]);
    }
  });
});

// A stand-in for Workers AI: each model's answer, by model name
const answering = (answers: Record<string, unknown>, usage = { prompt_tokens: 300, completion_tokens: 40 }) =>
  vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const model = Object.keys(answers).find((name) => String(url).endsWith(name));
    const answer = model ? answers[model] : undefined;
    if (answer instanceof Response) return answer;
    return new Response(JSON.stringify({ success: true, result: { response: answer, usage } }), { status: 200 });
  });

const [LLAMA, MISTRAL] = TAG_MODELS.map((model) => model.name);
const settings = { accountId: "a".repeat(32), token: "t".repeat(40) };

describe("tagShow", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks two different model families, and returns what they agree on with the Neurons used", async () => {
    const fetch = answering({
      [LLAMA]: { words: [{ word: "wailed", sense: "hear" }, { word: "rough", sense: "feel" }] },
      [MISTRAL]: '{"words": [{"word": "wailed", "sense": "hear"}, {"word": "trees", "sense": "see"}]}',
    });
    vi.stubGlobal("fetch", fetch);

    const { tags: found, neurons } = await tagShow(SHOW, settings, AbortSignal.timeout(1000));

    expect(found).toEqual([{ word: "wailed", sense: "hear" }]);
    const usage = { prompt_tokens: 300, completion_tokens: 40 };
    expect(neurons).toBeCloseTo(neuronsFor(TAG_MODELS[0], usage) + neuronsFor(TAG_MODELS[1], usage));
    expect(neurons).toBeLessThan(40);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(TAG_MODELS[0].name.split("/")[1]).not.toBe(TAG_MODELS[1].name.split("/")[1]);
    // Llama gets a JSON schema; Mistral is asked for JSON in its prompt
    const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies[0].response_format.type).toBe("json_schema");
    expect(bodies[1].response_format).toBeUndefined();
    expect(bodies[1].messages[0].content).toContain("Answer only with JSON");
    // Only the sentence's words are sent
    expect(bodies[0].messages[1].content).toBe(`Sentence: ${SHOW}`);
  });

  it("says when the day's free Neurons have run out", async () => {
    const out = new Response(JSON.stringify({ success: false, errors: [{ code: 3036, message: "daily free allocation" }] }), {
      status: 429,
    });
    vi.stubGlobal("fetch", answering({ [LLAMA]: out }));
    await expect(tagShow(SHOW, settings, AbortSignal.timeout(1000))).rejects.toMatchObject({ status: 429 });
  });

  it("says when a model's answer can't be read", async () => {
    vi.stubGlobal("fetch", answering({ [LLAMA]: { words: [] }, [MISTRAL]: "Sorry, I can't." }));
    await expect(tagShow(SHOW, settings, AbortSignal.timeout(1000))).rejects.toMatchObject({ invalid: true });
  });
});

describe("taggerSetup", () => {
  it("has the Cloudflare account and token, or nothing (the owner's switch says whether it runs)", () => {
    expect(taggerSetup({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t" })).toEqual({ accountId: "a", token: "t" });
    expect(taggerSetup({ CLOUDFLARE_ACCOUNT_ID: "a" })).toBeNull();
    expect(taggerSetup({})).toBeNull();
  });
});

describe("the tagger's queue", () => {
  const add = async (fields: Record<string, unknown> = {}, id = `g-${Math.random()}`) => {
    const author = await createUser({ id, email: `${Math.random()}@example.com` });
    return Sentence.create({ title: "Day 1", tell: "It is cold outside.", show: SHOW, author: author._id, GID: author.id, ...fields });
  };
  const tagged = (id: unknown) =>
    Sentence.findById(id, { senseTags: 1, taggedShow: 1, taggedAt: 1 }).lean<{
      senseTags?: { word: string; sense: string }[];
      taggedShow?: string;
      taggedAt?: Date;
    }>();
  const agreeing = vi.fn(async () => ({ tags: [{ word: "wailed", sense: "hear" as const }], neurons: 30 }));

  it("tags approved sentences, and leaves waiting and test accounts' sentences alone", async () => {
    const approved = await add({ approved: true });
    const waiting = await add();
    const qa = await add({ approved: true }, `${TEST_ACCOUNT_PREFIX}student`);

    const result = await tagApprovedSentences(settings, { tag: agreeing });

    expect(result).toEqual({ tagged: 1, unreadable: 0, neurons: 30 });
    expect(await tagged(approved._id)).toMatchObject({ senseTags: [{ word: "wailed", sense: "hear" }], taggedShow: SHOW });
    expect((await tagged(waiting._id))?.taggedShow).toBeUndefined();
    expect((await tagged(qa._id))?.taggedShow).toBeUndefined();
  });

  it("doesn't tag the same words twice, but tags new words once approved again", async () => {
    const sentence = await add({ approved: true });
    const tag = vi.fn(agreeing);
    await tagApprovedSentences(settings, { tag });
    await tagApprovedSentences(settings, { tag });
    expect(tag).toHaveBeenCalledTimes(1);

    await Sentence.updateOne({ _id: sentence._id }, { $set: { show: "The bell rang." } });
    await tagApprovedSentences(settings, { tag });
    expect(tag).toHaveBeenCalledTimes(2);
  });

  it(`tags at most ${TAGS_PER_RUN} a run, and stops for the day at its daily limit`, async () => {
    for (let i = 0; i < TAGS_PER_RUN + 2; i++) await add({ approved: true });
    expect((await tagApprovedSentences(settings, { tag: agreeing })).tagged).toBe(TAGS_PER_RUN);
    // 5 tagged today, with a daily limit of 6: one more
    expect(await tagApprovedSentences(settings, { tag: agreeing, perDay: 6 })).toMatchObject({ tagged: 1 });
    expect(await tagApprovedSentences(settings, { tag: agreeing, perDay: 6 })).toMatchObject({
      tagged: 0,
      stopped: "daily-limit",
    });
  });

  it("stops the run when the free Neurons run out, saving nothing for that sentence", async () => {
    const sentence = await add({ approved: true });
    const out = vi.fn(async () => {
      throw new ProviderError("Out of free Neurons", 429);
    });
    expect(await tagApprovedSentences(settings, { tag: out })).toMatchObject({ tagged: 0, stopped: "out-of-neurons" });
    expect((await tagged(sentence._id))?.taggedShow).toBeUndefined();
  });

  it("saves no AI highlights when an answer can't be read, so it isn't tried every run", async () => {
    const sentence = await add({ approved: true });
    const garbled = vi.fn(async () => {
      throw new ProviderError("Couldn't read", undefined, true);
    });
    expect(await tagApprovedSentences(settings, { tag: garbled })).toMatchObject({ tagged: 1, unreadable: 1 });
    expect(await tagged(sentence._id)).toMatchObject({ senseTags: [], taggedShow: SHOW });
  });

  it("tries a sentence again next run after a timeout or a network error", async () => {
    const sentence = await add({ approved: true });
    const flaky = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await tagApprovedSentences(settings, { tag: flaky })).toMatchObject({ tagged: 0 });
    expect((await tagged(sentence._id))?.taggedShow).toBeUndefined();
  });
});
