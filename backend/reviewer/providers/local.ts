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
  CHECKLIST_INSTRUCTIONS,
  CHECKLIST_SCHEMA,
  DANGER_INSTRUCTIONS,
  REVIEW_INSTRUCTIONS,
  reviewMessage,
  SUITABLE_INSTRUCTIONS,
  SUITABLE_SCHEMA,
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

// No thinking out loud first. Some models (Qwen 3) do by default, and it
// uses up the few tokens an answer is allowed, leaving the answer empty: in
// the first measurement they answered nothing at all. Models that don't
// think take no notice.
const NO_THINKING = { reasoning_effort: "none" };

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
        ...NO_THINKING,
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
        ...NO_THINKING,
      },
      signal
    ),
});

// The writing checklist and the gallery question (prompt.ts), for the
// decider (decide.ts). Each returns the raw answer; the caller checks it
// against its fixed form (contract.ts: ChecklistAnswer, SuitableAnswer).
const ask =
  (settings: LocalSettings, name: string, instructions: string, schema: unknown, maxTokens: number) =>
  (input: ReviewInput, signal: AbortSignal) =>
    chat(
      settings,
      {
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: reviewMessage(input) },
        ],
        response_format: form(name, schema),
        max_tokens: maxTokens,
        ...NO_THINKING,
      },
      signal
    );

export const localChecklist = (settings: LocalSettings) => ({
  name: `local-checklist:${settings.model}`,
  check: ask(settings, "checklist", CHECKLIST_INSTRUCTIONS, CHECKLIST_SCHEMA, 60),
});

export const localSuitable = (settings: LocalSettings) => ({
  name: `local-suitable:${settings.model}`,
  check: ask(settings, "suitable", SUITABLE_INSTRUCTIONS, SUITABLE_SCHEMA, 20),
});
