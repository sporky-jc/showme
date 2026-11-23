import { afterEach, describe, expect, it, vi } from "vitest";
import { Sentence } from "../models/sentences.js";
import { ProviderError } from "../reviewer/providers/http.js";
import { TEST_ACCOUNT_PREFIX } from "../config/testAccounts.js";
import { agreedTags, readLabels, wordsToLabel, type SenseKey } from "../tagger/senseTags.js";
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

describe("wordsToLabel", () => {
  it("is the sentence's words to ask about: once each, in order, less small and blocked words", () => {
    expect(wordsToLabel(SHOW)).toEqual(["wind", "wailed", "trees", "bark", "felt", "rough"]);
    expect(wordsToLabel("I was so happy, and the cake smelled sweet, so sweet!")).toEqual(["cake", "smelled", "sweet"]);
  });

  it("is empty when there's nothing to ask about", () => {
    expect(wordsToLabel("I was so happy.")).toEqual([]);
  });
});

describe("readLabels", () => {
  const WORDS = ["wind", "wailed", "trees", "bark", "felt", "rough"];

  it("keeps the asked words with a clear sense, once each, and leaves out none and anything else", () => {
    const read = readLabels(
      {
        labels: [
          { word: "Wailed", sense: "hear", clear: true },
          { word: "wailed", sense: "see", clear: true }, // a second answer: the first counts
          { word: "trees", sense: "none", clear: true },
          { word: "howled", sense: "hear", clear: true }, // not asked about
          { word: "rough", sense: "touch", clear: true }, // not a sense
          { word: "bark", sense: "feel", clear: true },
        ],
      },
      WORDS
    );
    expect([...(read ?? [])]).toEqual([
      ["wailed", "hear"],
      ["bark", "feel"],
    ]);
  });

  it("leaves out a judgment call: a sense the model isn't clearly sure of, or doesn't say", () => {
    const read = readLabels(
      {
        labels: [
          { word: "wailed", sense: "hear", clear: true },
          { word: "rough", sense: "feel", clear: false },
          { word: "bark", sense: "feel" },
          { word: "wind", sense: "feel", clear: "yes" },
        ],
      },
      WORDS
    );
    expect([...(read ?? [])]).toEqual([["wailed", "hear"]]);
  });

  it("reads JSON text leniently, as a model told to answer in JSON writes it", () => {
    const read = readLabels('Sure!\n```json\n{"labels": [{"word": "rough", "sense": "feel", "clear": true}]}\n```', WORDS);
    expect([...(read ?? [])]).toEqual([["rough", "feel"]]);
  });

  it("is empty when every word is none, and null for an answer it can't read", () => {
    expect(readLabels({ labels: [{ word: "wind", sense: "none" }] }, WORDS)?.size).toBe(0);
    expect(readLabels("I can't help with that.", WORDS)).toBeNull();
    expect(readLabels({ answer: "hear" }, WORDS)).toBeNull();
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
      [LLAMA]: {
        labels: [
          { word: "wailed", sense: "hear", clear: true },
          { word: "rough", sense: "feel", clear: true },
          { word: "trees", sense: "none", clear: true },
          { word: "bark", sense: "feel", clear: false },
        ],
      },
      [MISTRAL]:
        '{"labels": [{"word": "wailed", "sense": "hear", "clear": true}, {"word": "rough", "sense": "none", "clear": true}, {"word": "trees", "sense": "see", "clear": true}, {"word": "bark", "sense": "feel", "clear": true}]}',
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
    // Only the sentence and its own words are sent, the same to both
    expect(bodies[0].messages[1].content).toBe(`Sentence: ${SHOW}\nWords: wind, wailed, trees, bark, felt, rough`);
    expect(bodies[1].messages[1].content).toBe(bodies[0].messages[1].content);
  });

  it("asks nothing when the sentence has no words to ask about", async () => {
    const fetch = answering({});
    vi.stubGlobal("fetch", fetch);
    expect(await tagShow("I was so happy.", settings, AbortSignal.timeout(1000))).toEqual({ tags: [], neurons: 0, answers: [new Map(), new Map()] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says when the day's free Neurons have run out", async () => {
    const out = new Response(JSON.stringify({ success: false, errors: [{ code: 3036, message: "daily free allocation" }] }), {
      status: 429,
    });
    vi.stubGlobal("fetch", answering({ [LLAMA]: out }));
    await expect(tagShow(SHOW, settings, AbortSignal.timeout(1000))).rejects.toMatchObject({
      status: 429,
      detail: "3036: daily free allocation",
    });
  });

  it("says what Cloudflare said when it turns a request away for another reason", async () => {
    const busy = new Response(JSON.stringify({ success: false, errors: [{ code: 3040, message: "Capacity temporarily exceeded" }] }), {
      status: 429,
    });
    vi.stubGlobal("fetch", answering({ [LLAMA]: busy }));
    await expect(tagShow(SHOW, settings, AbortSignal.timeout(1000))).rejects.toMatchObject({
      status: 429,
      detail: "3040: Capacity temporarily exceeded",
    });
  });

  it("says when a model's answer can't be read", async () => {
    vi.stubGlobal("fetch", answering({ [LLAMA]: { labels: [] }, [MISTRAL]: "Sorry, I can't." }));
    await expect(tagShow(SHOW, settings, AbortSignal.timeout(1000))).rejects.toMatchObject({ invalid: true });
  });
});

describe("taggerSetup", () => {
  it("uses the sense account when both its settings are there, otherwise the main one", () => {
    const main = { CLOUDFLARE_ACCOUNT_ID: "main", CLOUDFLARE_AI_TOKEN: "main-token" };
    expect(taggerSetup({ ...main, CLOUDFLARE_SENSE_ACCOUNT_ID: "sense", CLOUDFLARE_SENSE_AI_TOKEN: "sense-token" })).toEqual({
      accountId: "sense",
      token: "sense-token",
    });
    // Half a sense account isn't one: never one account's id with another's token
    expect(taggerSetup({ ...main, CLOUDFLARE_SENSE_ACCOUNT_ID: "sense" })).toEqual({ accountId: "main", token: "main-token" });
    expect(taggerSetup({ CLOUDFLARE_SENSE_ACCOUNT_ID: "sense", CLOUDFLARE_SENSE_AI_TOKEN: "sense-token" })).toEqual({
      accountId: "sense",
      token: "sense-token",
    });
  });

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

  it("stops the run when Workers AI turns requests away, saving nothing for that sentence and saying why", async () => {
    const sentence = await add({ approved: true });
    const out = vi.fn(async () => {
      throw new ProviderError("HTTP 429", 429, false, "3040: Capacity temporarily exceeded");
    });
    expect(await tagApprovedSentences(settings, { tag: out })).toMatchObject({
      tagged: 0,
      stopped: "rate-limited",
      detail: "3040: Capacity temporarily exceeded",
    });
    expect((await tagged(sentence._id))?.taggedShow).toBeUndefined();
  });

  it.each([
    ["retired (410)", new ProviderError("HTTP 410", 410, false, "5028: AiError: Model has been deprecated")],
    ["unknown (5007)", new ProviderError("HTTP 400", 400, false, "5007: No such model")],
    ["not found (404)", new ProviderError("HTTP 404", 404)],
  ])("stops the run when a model is %s, instead of trying every sentence every run", async (_, gone) => {
    await add({ approved: true });
    await add({ approved: true, title: "day2" });
    const tag = vi.fn(async () => {
      throw gone;
    });
    expect(await tagApprovedSentences(settings, { tag })).toMatchObject({ tagged: 0, stopped: "model-gone", detail: gone.detail });
    expect(tag).toHaveBeenCalledTimes(1);
  });

  it("keeps going after any other one-off error (it's tried again next run)", async () => {
    await add({ approved: true });
    await add({ approved: true, title: "day2" });
    const tag = vi.fn(async () => {
      throw new ProviderError("HTTP 400", 400, false, "5006: Bad input");
    });
    expect(await tagApprovedSentences(settings, { tag })).toMatchObject({ tagged: 0 });
    expect(tag).toHaveBeenCalledTimes(2);
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
