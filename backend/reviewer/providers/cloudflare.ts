// Cloudflare Workers AI: the safety check, the welfare check and the main AI
// reviewer.
//
// Free: 10,000 "Neurons" a day on the Workers Free plan, with no card.
// When they run out, requests fail until midnight UTC (nothing is ever
// charged), and the reviewer leaves sentences for the teacher. A review
// with its safety check used roughly 50 Neurons; the welfare check is a
// second, shorter call to the same 70B model, so count on roughly 90, about
// 100 sentences a day (an estimate: measure it on the account). Cloudflare
// doesn't train models on what it's sent or keep it
// (developers.cloudflare.com/workers-ai/platform/data-usage/).
//
// Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN (an API token with
// only the "Workers AI" permission). See docs/ai-reviewer-setup.md.
import type { ReviewInput, ReviewProvider, SafetyCheck, WelfareCheck, WelfareQuestion } from "../reviewer.js";
import {
  ANSWER_SCHEMA,
  DANGER_INSTRUCTIONS,
  REVIEW_INSTRUCTIONS,
  reviewMessage,
  WELFARE_INSTRUCTIONS,
  WELFARE_SCHEMA,
} from "../prompt.js";
import { asJson, postJson, ProviderError } from "./http.js";

export interface CloudflareSettings {
  accountId: string;
  token: string;
  // Which model reviews (any Workers AI text model that can answer in JSON)
  model?: string;
}

export const CLOUDFLARE_REVIEW_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const CLOUDFLARE_SAFETY_MODEL = "@cf/meta/llama-guard-3-8b";
// The welfare check's model: fixed, not the reviewer's (which can be changed
// with CLOUDFLARE_REVIEW_MODEL), so trying another reviewer never weakens it
export const CLOUDFLARE_WELFARE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const runUrl = (accountId: string, model: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;

// Out of the day's free Neurons. Not checked against a live account (no
// request is ever sent from here to find out): Cloudflare's API reports
// errors as { success: false, errors: [{ code, message }] }, and as we
// understand it the daily free allocation running out is error code 3036,
// "you have used up your daily free allocation of 10,000 neurons", sent
// with HTTP 429. In case it comes with another status, or with a 200 and
// success: false, that code or that message is read as 429 wherever it
// comes, so the run stops (reviewer/queue.ts) rather than trying every
// other sentence. If the real answer turns out different, change this.
const OUT_OF_NEURONS = 3036;
export const isOutOfNeurons = (body: unknown) => {
  const errors = (body as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errors)) return false;
  return errors.some((error: { code?: unknown; message?: unknown } | null) =>
    error?.code === OUT_OF_NEURONS ||
    // (Not any message about Neurons: only the daily allocation running out)
    (typeof error?.message === "string" && /daily free allocation/i.test(error.message))
  );
};
export const statusOf = (errorBody: unknown, status: number) => (isOutOfNeurons(errorBody) ? 429 : status);

// A model Workers AI no longer has: retired (HTTP 410, error 5028 "Model has
// been deprecated", as Qwen 3 answered on 2026-11-23) or unknown (HTTP 404,
// or error 5007 "No such model"). Every request to it will fail the same
// way, so a run should stop, not try again sentence after sentence.
export const isModelGone = (status: number | undefined, detail: string | undefined) =>
  status === 404 || status === 410 || /(^|; )(5007|5028)\b/.test(detail ?? "");

// Cloudflare's own words for an error, for the logs: "3036: ..." for each
// error it lists, so a refusal says which (out of Neurons, a busy model, a
// token without permission). Cloudflare's error messages are about the
// request, never the text sent; each is cut short anyway.
export const errorDetail = (body: unknown): string | undefined => {
  const errors = (body as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errors)) return undefined;
  const parts = errors
    .map((error: { code?: unknown; message?: unknown } | null) =>
      [error?.code, typeof error?.message === "string" ? error.message.slice(0, 160) : undefined]
        .filter((part) => part !== undefined && part !== null)
        .join(": ")
    )
    .filter(Boolean);
  return parts.length ? parts.join("; ") : undefined;
};

// Workers AI wraps every answer: { success, result: { response } }
const responseOf = (body: unknown): unknown => {
  const envelope = body as { success?: boolean; result?: { response?: unknown } } | null;
  if (isOutOfNeurons(envelope)) throw new ProviderError("Out of free Neurons", 429, false, errorDetail(envelope));
  if (!envelope || envelope.success === false || !envelope.result) {
    throw new ProviderError("Unexpected answer from Workers AI", undefined, false, errorDetail(envelope));
  }
  return envelope.result.response;
};

export const cloudflareReviewer = ({ accountId, token, model = CLOUDFLARE_REVIEW_MODEL }: CloudflareSettings): ReviewProvider => ({
  name: `cloudflare:${model}`,
  review: async (input: ReviewInput, signal: AbortSignal) => {
    const body = await postJson(
      runUrl(accountId, model),
      token,
      {
        messages: [
          { role: "system", content: REVIEW_INSTRUCTIONS },
          { role: "user", content: reviewMessage(input) },
        ],
        response_format: { type: "json_schema", json_schema: ANSWER_SCHEMA },
        // Same answer for the same sentence, and nothing long
        temperature: 0,
        max_tokens: 40,
      },
      signal,
      { statusOf, detailOf: errorDetail }
    );
    return asJson(responseOf(body));
  },
});

// Llama Guard 3: a model that only says whether text is safe (violence,
// self-harm, sexual content, hate, and the rest of its list). It reads the
// Show sentence as a child's message. Its answer is "safe" or "unsafe" and a
// category; anything else is a failure, and a failed check never lets a
// sentence through (reviewer.ts).
export const cloudflareSafety = ({ accountId, token }: CloudflareSettings): SafetyCheck => ({
  name: `cloudflare:${CLOUDFLARE_SAFETY_MODEL}`,
  check: async ({ show }: ReviewInput, signal: AbortSignal) => {
    const body = await postJson(
      runUrl(accountId, CLOUDFLARE_SAFETY_MODEL),
      token,
      { messages: [{ role: "user", content: show }], temperature: 0, max_tokens: 20 },
      signal,
      { statusOf, detailOf: errorDetail }
    );
    return readSafetyAnswer(asJson(responseOf(body)));
  },
});

// Llama Guard's answer, read strictly. As an object: { safe: true } with no
// categories is safe; { safe: false }, or any category named, is unsafe (a
// "safe" answer that names a category is read the careful way). As text:
// "safe" alone (any case, with an end mark or spaces around it) is safe;
// "unsafe" first, then anything ("unsafe\nS11", "unsafe,S11"), is unsafe.
// Anything else is an invalid answer: thrown, and never read as safe.
export const readSafetyAnswer = (answer: unknown): "safe" | "unsafe" => {
  if (answer && typeof answer === "object" && typeof (answer as { safe?: unknown }).safe === "boolean") {
    const { safe, categories } = answer as { safe: boolean; categories?: unknown };
    const named = Array.isArray(categories)
      ? categories.length > 0
      : categories !== undefined && categories !== null && categories !== "";
    return safe && !named ? "safe" : "unsafe";
  }
  if (typeof answer === "string") {
    const text = answer.trim().toLowerCase();
    if (/^safe[.!]?$/.test(text)) return "safe";
    if (/^unsafe(?![a-z])/.test(text)) return "unsafe";
  }
  throw new ProviderError("Unexpected answer from the safety check", undefined, true);
};

// The welfare check (reviewer.ts, step 3): the same kind of call as the
// reviewer, with its own instructions and answer form (prompt.ts). Its
// answer is handed back as it came; the reviewer checks it strictly, and
// anything but {"concern": "no"} holds the sentence as worrying. Named apart
// from the reviewer, though it's the same model, so the queue can tell their
// attempts apart (queue.ts).
export const cloudflareWelfare = ({ accountId, token }: CloudflareSettings): WelfareCheck => ({
  name: `cloudflare-welfare:${CLOUDFLARE_WELFARE_MODEL}`,
  check: async (input: ReviewInput, signal: AbortSignal, question: WelfareQuestion = "welfare") => {
    const body = await postJson(
      runUrl(accountId, CLOUDFLARE_WELFARE_MODEL),
      token,
      {
        messages: [
          { role: "system", content: question === "danger" ? DANGER_INSTRUCTIONS : WELFARE_INSTRUCTIONS },
          { role: "user", content: reviewMessage(input) },
        ],
        response_format: { type: "json_schema", json_schema: WELFARE_SCHEMA },
        temperature: 0,
        max_tokens: 20,
      },
      signal,
      { statusOf, detailOf: errorDetail }
    );
    return asJson(responseOf(body));
  },
});
