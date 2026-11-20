// Groq: a second AI reviewer, OFF unless REVIEWER_USE_GROQ is "yes".
//
// Free plan with no card, and inputs aren't kept with Zero Data Retention
// on. But Groq's Terms of Sale don't allow sending data about children
// under 13 (console.groq.com/docs/terms-of-sale), so it is only for classes
// where every student is 13 or older. See docs/ai-reviewer-setup.md.
import type { ReviewInput, ReviewProvider } from "../reviewer.js";
import { ANSWER_SCHEMA, REVIEW_INSTRUCTIONS, reviewMessage } from "../prompt.js";
import { asJson, postJson, ProviderError } from "./http.js";

export const GROQ_REVIEW_MODEL = "openai/gpt-oss-120b";

export const groqReviewer = ({ apiKey, model = GROQ_REVIEW_MODEL }: { apiKey: string; model?: string }): ReviewProvider => ({
  name: `groq:${model}`,
  review: async (input: ReviewInput, signal: AbortSignal) => {
    const body = (await postJson(
      "https://api.groq.com/openai/v1/chat/completions",
      apiKey,
      {
        model,
        messages: [
          { role: "system", content: REVIEW_INSTRUCTIONS },
          { role: "user", content: reviewMessage(input) },
        ],
        // Strict: Groq holds the model to the answer's form
        response_format: { type: "json_schema", json_schema: { name: "review", strict: true, schema: ANSWER_SCHEMA } },
        temperature: 0,
      },
      signal
    )) as { choices?: { message?: { content?: unknown } }[] } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (content === undefined) throw new ProviderError("Unexpected answer from Groq");
    return asJson(content);
  },
});
