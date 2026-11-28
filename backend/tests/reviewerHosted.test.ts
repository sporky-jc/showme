import { afterEach, describe, expect, it, vi } from "vitest";
import type { Types } from "mongoose";
import { ReviewLine, hashShow, saveAnswer } from "../models/reviewLine.js";
import { HostedUsage, kidHash } from "../models/hostedUsage.js";
import { questionVersion } from "../reviewer/asks.js";
import { HOSTED_PER_DAY, HOSTED_PER_KID, KEPT_FOR_WORRIES, askHosted } from "../reviewer/hosted.js";
import { fillLine, stepLine } from "../reviewer/line.js";
import { HIDDEN, hasContactDetails, hasPersonalDetails, hideContactDetails } from "../reviewer/rules.js";
import { createSentence, createUser } from "./helpers.js";

// Asking the hosted model for the review line (tasks/scribbles-worker-spec.md,
// T11, second part). Made-up sentences only; no request leaves the test.

const SETTINGS = { accountId: "test-account", token: "test-token" };
const CHECKLIST_OK = { suitable: "yes", onTopic: "yes", technique: "yes", shows: "yes", detail: "see", grammar: "yes" };
const MODELS = { safety: "llama-guard3:8b@aaa", first: "gemma4:e4b@bbb", second: "qwen3.5:9b@ccc" } as const;

afterEach(() => vi.unstubAllGlobals());

describe("hiding contact details", () => {
  const cases: [string, string[]][] = [
    ["My phone is 555-123-4567 and I'm only 7.", ["555", "4567"]],
    ["Email me at sam.k@gmail.com after school.", ["sam.k@gmail.com"]],
    ["My snapchat is samcool, add me tonight.", ["samcool"]],
    ["Snap: frosty_kid", ["frosty_kid"]],
    ["I live at 42 Maple Street with my mom.", ["42", "Maple"]],
    ["I go to Lincoln Elementary and it's cold.", ["Lincoln"]],
    ["Emma Johnson pushed me in the hall.", ["Johnson"]],
  ];
  it.each(cases)("hides them in %s", (text, gone) => {
    const hidden = hideContactDetails(text);
    for (const word of gone) expect(hidden).not.toContain(word);
    expect(hidden).toContain(HIDDEN);
    expect(hasContactDetails(hidden)).toBe(false);
  });

  it("keeps ages, and the rest of the sentence", () => {
    expect(hideContactDetails("My phone is 555-123-4567 and I'm only 7.")).toBe(`My phone is ${HIDDEN} and I'm only 7.`);
    expect(hideContactDetails("I've been home alone since yesterday and I'm only 7.")).toBe("I've been home alone since yesterday and I'm only 7.");
    expect(hideContactDetails("Emma Johnson pushed me in the hall.")).toBe(`Emma ${HIDDEN} pushed me in the hall.`);
  });

  it("leaves ordinary sentences as they are", () => {
    for (const text of [
      "My breath puffed out like a little cloud, and the frozen grass crunched under my boots.",
      "We walked down the busy street to the park.",
      "I counted 1 2 3 4 5 6 7 8 snowflakes.",
    ]) {
      expect(hideContactDetails(text)).toBe(text);
    }
  });

  it("still finds personal details exactly as before", () => {
    expect(hasPersonalDetails("I'm only 7.")).toBe(true);
    expect(hasContactDetails("I'm only 7.")).toBe(false);
    expect(hasPersonalDetails("My snap is samcool")).toBe(true);
  });
});

// A sentence in line, with the local answers given
const inLine = async (show: string, answers: Partial<Record<"safety" | "firstWelfare" | "secondWelfare" | "secondChecklist", unknown>>, gid?: string) => {
  const n = Math.random().toString(36).slice(2);
  const user = await createUser({ id: gid ?? `google-${n}`, email: `${n}@example.com` });
  const sentence = await createSentence(user, { show });
  await fillLine();
  const line = (await ReviewLine.findOne({ sentence: sentence._id }).lean())!;
  const save = (reader: "safety" | "first" | "second", question: "safety" | "welfare" | "checklist", answer: unknown) =>
    saveAnswer({ line: line._id, showHash: hashShow(show), reader, question, model: MODELS[reader], questionVersion: questionVersion(question), answer });
  await save("safety", "safety", answers.safety ?? "safe");
  await save("first", "welfare", answers.firstWelfare ?? "no");
  await save("first", "checklist", CHECKLIST_OK);
  await save("second", "welfare", answers.secondWelfare ?? "no");
  if (answers.secondChecklist) await save("second", "checklist", answers.secondChecklist);
  await stepLine(line._id);
  return { sentence, lineId: line._id as Types.ObjectId, gid: user.id };
};

const answering = (response: unknown, status = 200) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(response), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const sent = (fetchMock: ReturnType<typeof answering>, call = 0) => String(fetchMock.mock.calls[call][1]?.body);

describe("asking the hosted model", () => {
  it("asks about a split worry, saves its answer, and the decider sends it to a teacher", async () => {
    const { lineId } = await inLine("Clothes carpeted the floor like a soft, lumpy rug.", { firstWelfare: "yes" });
    expect((await ReviewLine.findById(lineId).lean())?.needs).toEqual([{ reader: "hosted", question: "welfare" }]);
    const fetchMock = answering({ success: true, result: { response: { concern: "yes" } } });
    expect(await askHosted(SETTINGS)).toEqual({ asked: 1, saved: 1, held: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await stepLine(lineId)).toEqual({ step: "teacher", because: "worry" });
  });

  it("asks about a writing tie, and its checklist decides", async () => {
    const { lineId } = await inLine("Clothes carpeted the floor like a soft, lumpy rug.", { secondChecklist: { ...CHECKLIST_OK, shows: "no" } });
    expect((await ReviewLine.findById(lineId).lean())?.needs).toEqual([{ reader: "hosted", question: "checklist" }]);
    answering({ success: true, result: { response: JSON.stringify(CHECKLIST_OK) } });
    expect(await askHosted(SETTINGS)).toEqual({ asked: 1, saved: 1, held: 0 });
    expect(await stepLine(lineId)).toMatchObject({ step: "approve" });
  });

  it("never sends a contact detail: the phone number is hidden, the age kept", async () => {
    // Both local models worry, and there are personal details: the hosted
    // model is asked whether it's a real worry
    const { lineId } = await inLine("Call me at 555-123-4567, I'm only 7 and my brother bugs me.", { firstWelfare: "yes", secondWelfare: "yes" });
    expect((await ReviewLine.findById(lineId).lean())?.needs).toEqual([{ reader: "hosted", question: "welfare" }]);
    const fetchMock = answering({ success: true, result: { response: { concern: "yes" } } });
    await askHosted(SETTINGS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = sent(fetchMock);
    expect(body).not.toContain("555");
    expect(body).not.toContain("4567");
    expect(body).toContain("only 7");
    expect(body).toContain(HIDDEN);
  });

  it("out of free Neurons: stops, and the sentence keeps waiting for it", async () => {
    const { lineId } = await inLine("Clothes carpeted the floor like a soft, lumpy rug.", { firstWelfare: "yes" });
    answering({ success: false, errors: [{ code: 3036, message: "you have used up your daily free allocation of 10,000 neurons" }] }, 429);
    expect(await askHosted(SETTINGS)).toMatchObject({ stopped: "out-of-neurons", saved: 0 });
    const line = await ReviewLine.findById(lineId).lean();
    expect(line?.state).toBe("waiting");
    expect(line?.needs).toEqual([{ reader: "hosted", question: "welfare" }]);
  });

  it("a nonsense answer counts as a failed try, and nothing is saved", async () => {
    const { lineId } = await inLine("Clothes carpeted the floor like a soft, lumpy rug.", { firstWelfare: "yes" });
    answering({ success: true, result: { response: "probably fine" } });
    expect(await askHosted(SETTINGS)).toEqual({ asked: 1, saved: 0, held: 0 });
    expect((await ReviewLine.findById(lineId).lean())?.failedTries?.hosted).toBe(1);
  });

  it("keeps within the day's allowance", async () => {
    await inLine("Clothes carpeted the floor like a soft, lumpy rug.", { firstWelfare: "yes" });
    const now = new Date();
    await HostedUsage.insertMany(Array.from({ length: HOSTED_PER_DAY }, () => ({ at: now, about: "worry", kid: "someone" })));
    const fetchMock = answering({ success: true, result: { response: { concern: "yes" } } });
    expect(await askHosted(SETTINGS, { now })).toMatchObject({ asked: 0, stopped: "allowance" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps part of the day for worries: a writing tie waits, a worry is still asked", async () => {
    await inLine("Clothes carpeted the floor like a soft, lumpy rug.", { secondChecklist: { ...CHECKLIST_OK, shows: "no" } });
    const now = new Date();
    await HostedUsage.insertMany(Array.from({ length: HOSTED_PER_DAY - KEPT_FOR_WORRIES }, () => ({ at: now, about: "writing", kid: "someone" })));
    const fetchMock = answering({ success: true, result: { response: { concern: "yes" } } });
    expect(await askHosted(SETTINGS, { now })).toEqual({ asked: 0, saved: 0, held: 0 });
    await inLine("The floor was a sea of socks and shirts.", { firstWelfare: "yes" });
    expect(await askHosted(SETTINGS, { now })).toEqual({ asked: 1, saved: 1, held: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("limits what one child can use", async () => {
    const { gid } = await inLine("Clothes carpeted the floor like a soft, lumpy rug.", { firstWelfare: "yes" }, "google-busy-kid");
    const now = new Date();
    await HostedUsage.insertMany(Array.from({ length: HOSTED_PER_KID }, () => ({ at: now, about: "worry", kid: kidHash(gid) })));
    const fetchMock = answering({ success: true, result: { response: { concern: "yes" } } });
    expect(await askHosted(SETTINGS, { now })).toEqual({ asked: 0, saved: 0, held: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks nothing when the line needs nothing from it", async () => {
    await inLine("Clothes carpeted the floor like a soft, lumpy rug.", {});
    const fetchMock = answering({ success: true, result: { response: { concern: "yes" } } });
    expect(await askHosted(SETTINGS)).toEqual({ asked: 0, saved: 0, held: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
