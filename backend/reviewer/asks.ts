// What the worker on the VM sends each local model (tasks/scribbles-worker-spec.md,
// T10): the exact request body for each question, built here from the same
// instructions the rest of Scribbles uses (prompt.ts), so there's one copy
// of every prompt. The worker adds only the model's name and sends it to
// Ollama's OpenAI-style route as it is; it never writes a prompt, and never
// reads an answer: it posts the model's raw reply back, and readAnswer below
// checks it strictly.
//
// Each question has a version: a hash of its request with the sentence left
// out, so a changed prompt, answer form or token limit makes old answers
// stop counting (models/reviewLine.ts).
import { ChecklistAnswer, RealRiskAnswer, WelfareAnswer } from "./contract.js";
import {
  CHECKLIST_INSTRUCTIONS,
  CHECKLIST_SCHEMA,
  DANGER_INSTRUCTIONS,
  REAL_RISK_INSTRUCTIONS,
  REAL_RISK_SCHEMA,
  reviewMessage,
  WELFARE_INSTRUCTIONS,
  WELFARE_SCHEMA,
} from "./prompt.js";
import { readSafetyAnswer } from "./providers/cloudflare.js";
import { asJson } from "./providers/http.js";
import { versionOf, type Question } from "../models/reviewLine.js";

const form = (name: string, schema: unknown) => ({ type: "json_schema", json_schema: { name, strict: true, schema } });

// No thinking out loud first: without it Qwen uses up its few tokens and
// answers nothing (the first measurement, PR #237)
const NO_THINKING = { reasoning_effort: "none" };

export interface Ask {
  question: Question;
  version: string;
  // The body to send, with no model name (the worker adds it) and
  // temperature 0
  request: Record<string, unknown>;
}

const SENTENCE = "{sentence}";

// Each question's request, with the sentence as a placeholder
const TEMPLATES: Record<Question, (message: string, show: string) => Record<string, unknown>> = {
  // Llama Guard reads the Show sentence as a child's message
  safety: (_message, show) => ({ messages: [{ role: "user", content: show }], max_tokens: 20 }),
  welfare: (message) => ({
    messages: [
      { role: "system", content: WELFARE_INSTRUCTIONS },
      { role: "user", content: message },
    ],
    response_format: form("welfare", WELFARE_SCHEMA),
    max_tokens: 20,
    ...NO_THINKING,
  }),
  danger: (message) => ({
    messages: [
      { role: "system", content: DANGER_INSTRUCTIONS },
      { role: "user", content: message },
    ],
    response_format: form("welfare", WELFARE_SCHEMA),
    max_tokens: 20,
    ...NO_THINKING,
  }),
  realRisk: (message) => ({
    messages: [
      { role: "system", content: REAL_RISK_INSTRUCTIONS },
      { role: "user", content: message },
    ],
    response_format: form("risk", REAL_RISK_SCHEMA),
    max_tokens: 20,
    ...NO_THINKING,
  }),
  checklist: (message) => ({
    messages: [
      { role: "system", content: CHECKLIST_INSTRUCTIONS },
      { role: "user", content: message },
    ],
    response_format: form("checklist", CHECKLIST_SCHEMA),
    max_tokens: 70,
    ...NO_THINKING,
  }),
};

// Each question's template, picked from a fixed list (never looked up by
// a name sent to us)
const templateFor = (question: Question) => {
  switch (question) {
    case "safety":
      return TEMPLATES.safety;
    case "welfare":
      return TEMPLATES.welfare;
    case "danger":
      return TEMPLATES.danger;
    case "checklist":
      return TEMPLATES.checklist;
    case "realRisk":
      return TEMPLATES.realRisk;
  }
  throw new Error("Unknown question");
};

export const questionVersion = (question: Question) => versionOf(JSON.stringify(templateFor(question)(SENTENCE, SENTENCE)));

export const askFor = (question: Question, tell: string, show: string): Ask => ({
  question,
  version: questionVersion(question),
  request: { temperature: 0, ...templateFor(question)(reviewMessage({ tell, show }), show) },
});

// A model's raw reply, read strictly: the answer to save, or undefined when
// it isn't in the question's exact form (counted as a failed try)
export const readAnswer = (question: Question, raw: unknown): unknown => {
  if (typeof raw !== "string" || raw.length > 2000) return undefined;
  if (question === "safety") {
    try {
      return readSafetyAnswer(asJson(raw));
    } catch {
      return undefined;
    }
  }
  const value = asJson(raw);
  if (question === "checklist") return ChecklistAnswer.safeParse(value).success ? value : undefined;
  if (question === "realRisk") {
    const risk = RealRiskAnswer.safeParse(value);
    return risk.success ? risk.data.risk : undefined;
  }
  const welfare = WelfareAnswer.safeParse(value);
  return welfare.success ? welfare.data.concern : undefined;
};
