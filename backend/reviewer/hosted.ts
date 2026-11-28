// Asks the hosted model what the review line needs from it
// (tasks/scribbles-worker-spec.md, T11, second part): a worry the local
// models split on, or a writing tie between them (decide.ts). Run after the
// line keeper (line.ts), on the same schedule.
//
//   - Worries first. Writing ties may use the day's allowance only down to
//     a part kept back for worries.
//   - A rolling 24 hours, and a limit per child, so one child's edits can't
//     use everyone's (models/hostedUsage.ts).
//   - Contact details are hidden first, ages kept (the owner's choice). If
//     our own check still finds one after hiding, nothing is sent: the
//     sentence waits, and a worry reaches a teacher after an hour.
//   - Out of free Neurons, or a refused key: the run stops, and only the
//     sentences that need the hosted model wait.
//
// Its answer is saved in the line like any reader's, and read strictly
// (asks.ts). The decider takes it from there.
import { Sentence } from "../models/sentences.js";
import { ReviewLine, hashShow, recordFailure, saveAnswer, type Question } from "../models/reviewLine.js";
import { hostedAskedSince, kidHash, noteHostedAsk } from "../models/hostedUsage.js";
import { askFor, questionVersion, readAnswer } from "./asks.js";
import { decide } from "./decide.js";
import { factsFor } from "./line.js";
import { CHECKLIST_SCHEMA, WELFARE_SCHEMA } from "./prompt.js";
import { CLOUDFLARE_WELFARE_MODEL, errorDetail, isModelGone, runUrl, statusOf } from "./providers/cloudflare.js";
import { ProviderError, postJson } from "./providers/http.js";
import { hasContactDetails, hideContactDetails } from "./rules.js";

// The hosted model the line asks, and the name its answers are saved under
export const HOSTED_MODEL = CLOUDFLARE_WELFARE_MODEL;

// The line's share of the free allowance over a rolling 24 hours (about 100
// questions a day: providers/cloudflare.ts), the part of it kept for
// worries, and what one child may use
export const HOSTED_PER_DAY = 100;
export const KEPT_FOR_WORRIES = 30;
export const HOSTED_PER_KID = 5;
// At most this many questions a run, and failed tries on one version
// before it's left to wait out its time (a worry then reaches a teacher)
export const HOSTED_PER_RUN = 10;
export const HOSTED_TRIES = 2;
export const HOSTED_TIMEOUT_MS = 20_000;

export type HostedStop = "allowance" | "out-of-neurons" | "credentials" | "model-gone";

export interface HostedSettings {
  accountId: string;
  token: string;
}

// The Workers AI request for one question: the same instructions the local
// models get (asks.ts), in Cloudflare's answer form
const requestFor = (question: Question, tell: string, show: string) => {
  const { request } = askFor(question, tell, show);
  return {
    messages: request.messages,
    response_format: { type: "json_schema", json_schema: question === "checklist" ? CHECKLIST_SCHEMA : WELFARE_SCHEMA },
    temperature: 0,
    max_tokens: question === "checklist" ? 120 : 20,
  };
};

const rawOf = (body: unknown): string | undefined => {
  const envelope = body as { success?: boolean; result?: { response?: unknown } } | null;
  if (!envelope || envelope.success === false || envelope.result === undefined) return undefined;
  const response = envelope.result.response;
  return typeof response === "string" ? response : JSON.stringify(response);
};

export const askHosted = async (
  settings: HostedSettings,
  { now = new Date(), timeoutMs = HOSTED_TIMEOUT_MS } = {}
): Promise<{ asked: number; saved: number; held: number; stopped?: HostedStop }> => {
  const waiting = await ReviewLine.find({ state: "waiting", "needs.reader": "hosted" }, { sentence: 1, showHash: 1, needs: 1, answers: 1, failedTries: 1, worryRaisedAt: 1, writingTieAt: 1, createdAt: 1 })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();
  // Worries first, oldest first
  const isWorry = (line: (typeof waiting)[number]) => line.needs.some((n) => n.reader === "hosted" && n.question !== "checklist");
  const ordered = [...waiting.filter(isWorry), ...waiting.filter((line) => !isWorry(line))];

  let asked = 0;
  let saved = 0;
  let held = 0;
  let used = await hostedAskedSince(now);
  for (const line of ordered) {
    if (asked >= HOSTED_PER_RUN) break;
    const sentence = await Sentence.findById(line.sentence, { tell: 1, show: 1, GID: 1, approved: 1, toRedo: 1 }).lean();
    if ((line.failedTries?.hosted ?? 0) >= HOSTED_TRIES) continue;
    if (!sentence || sentence.approved || sentence.toRedo || hashShow(sentence.show) !== line.showHash) continue;
    // What the decider wants now (an answer may have come in since)
    const step = decide(await factsFor(line as Parameters<typeof factsFor>[0], sentence, { hostedModel: HOSTED_MODEL, now }));
    if (step.step !== "ask-hosted") continue;
    const about = step.about;
    const question: Question = about === "worry" ? step.question : "checklist";

    if (used >= HOSTED_PER_DAY) return { asked, saved, held, stopped: "allowance" };
    if (about === "writing" && used >= HOSTED_PER_DAY - KEPT_FOR_WORRIES) continue;
    const kid = kidHash(sentence.GID);
    if ((await hostedAskedSince(now, kid)) >= HOSTED_PER_KID) continue;

    // Contact details hidden; if any is still found, nothing is sent
    const show = hideContactDetails(sentence.show);
    if (hasContactDetails(show)) {
      held++;
      continue;
    }

    asked++;
    used++;
    await noteHostedAsk(now, about, kid);
    try {
      const body = await postJson(runUrl(settings.accountId, HOSTED_MODEL), settings.token, requestFor(question, sentence.tell, show), AbortSignal.timeout(timeoutMs), {
        statusOf,
        detailOf: errorDetail,
      });
      if (statusOf(body, 200) === 429) return { asked, saved, held, stopped: "out-of-neurons" };
      const answer = readAnswer(question, rawOf(body));
      if (answer === undefined) {
        await recordFailure(line._id, "hosted");
        continue;
      }
      const result = await saveAnswer(
        { line: line._id, showHash: line.showHash, reader: "hosted", question, model: HOSTED_MODEL, questionVersion: questionVersion(question), answer },
        now
      );
      if (result === "saved") saved++;
    } catch (error) {
      const status = error instanceof ProviderError ? error.status : undefined;
      if (status === 429) return { asked, saved, held, stopped: "out-of-neurons" };
      if (status === 401 || status === 403) return { asked, saved, held, stopped: "credentials" };
      if (error instanceof ProviderError && isModelGone(status, error.detail)) return { asked, saved, held, stopped: "model-gone" };
      // Down, slow or busy: this one waits and is tried again next run
      await recordFailure(line._id, "hosted");
    }
  }
  return { asked, saved, held };
};
