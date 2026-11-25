// Small open models on a machine of our own, asked through an OpenAI-style
// API (Ollama serves one at /v1/chat/completions). No key, no daily limit.
//
// FOR MEASURING ONLY (scripts/measure-reviewer.ts, on made-up samples). It is
// not in settings.ts, so the live reviewer never asks these models: whether
// they're good enough to is what the measurement is for.
//
// The same instructions and answer forms as the Cloudflare providers
// (prompt.ts), so the scores can be compared.
import type { ReviewInput, ReviewProvider, SafetyCheck, WelfareCheck, WelfareQuestion } from "../reviewer.js";
import {
  ANSWER_SCHEMA,
  DANGER_INSTRUCTIONS,
  REVIEW_INSTRUCTIONS,
  reviewMessage,
  WELFARE_INSTRUCTIONS,
  WELFARE_SCHEMA,
} from "../prompt.js";
import { readSafetyAnswer } from "./cloudflare.js";
import { asJson, postJson, ProviderError } from "./http.js";

export interface LocalSettings {
  // Where the API is, with no path: http://localhost:11434
  url: string;
  // The model's name there: llama3.1:8b
  model: string;
}

const chat = async ({ url, model }: LocalSettings, body: Record<string, unknown>, signal: AbortSignal) => {
  const answer = (await postJson(
    `${url.replace(/\/+$/, "")}/v1/chat/completions`,
    // No key is needed; the header has to say something
    "local",
    { model, temperature: 0, ...body },
    signal
  )) as { choices?: { message?: { content?: unknown } }[] } | null;
  const content = answer?.choices?.[0]?.message?.content;
  if (content === undefined) throw new ProviderError("Unexpected answer from the local model");
  return asJson(content);
};

const form = (name: string, schema: unknown) => ({
  type: "json_schema",
  json_schema: { name, strict: true, schema },
});

export const localReviewer = (settings: LocalSettings): ReviewProvider => ({
  name: `local:${settings.model}`,
  review: (input: ReviewInput, signal: AbortSignal) =>
    chat(
      settings,
      {
        messages: [
          { role: "system", content: REVIEW_INSTRUCTIONS },
          { role: "user", content: reviewMessage(input) },
        ],
        response_format: form("review", ANSWER_SCHEMA),
        max_tokens: 40,
      },
      signal
    ),
});

// Llama Guard: it reads the Show sentence as a child's message and answers
// "safe" or "unsafe" and a category, read as strictly as Cloudflare's
export const localSafety = (settings: LocalSettings): SafetyCheck => ({
  name: `local:${settings.model}`,
  check: async ({ show }: ReviewInput, signal: AbortSignal) =>
    readSafetyAnswer(await chat(settings, { messages: [{ role: "user", content: show }], max_tokens: 20 }, signal)),
});

export const localWelfare = (settings: LocalSettings): WelfareCheck => ({
  name: `local-welfare:${settings.model}`,
  check: (input: ReviewInput, signal: AbortSignal, question: WelfareQuestion = "welfare") =>
    chat(
      settings,
      {
        messages: [
          { role: "system", content: question === "danger" ? DANGER_INSTRUCTIONS : WELFARE_INSTRUCTIONS },
          { role: "user", content: reviewMessage(input) },
        ],
        response_format: form("welfare", WELFARE_SCHEMA),
        max_tokens: 20,
      },
      signal
    ),
});
