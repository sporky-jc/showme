// The sense tagger's requests (Stage A of tasks/sense-words-plan.md): one
// approved sentence to two free Workers AI models from different families,
// and the words both agree on (senseTags.ts). Only the sentence's words are
// sent, nothing about the kid. Cloudflare keeps no inputs or outputs and
// trains on none (developers.cloudflare.com/workers-ai/platform/data-usage/,
// read 2026-11-22).
import { postJson, ProviderError } from "../reviewer/providers/http.js";
import { errorDetail, isOutOfNeurons, runUrl, statusOf } from "../reviewer/providers/cloudflare.js";
import {
  ANSWER_AS_JSON,
  TAG_INSTRUCTIONS,
  TAG_SCHEMA,
  agreedTags,
  readTags,
  tagMessage,
  type SenseKey,
  type SenseTag,
} from "./senseTags.js";

// The two models, in one place: different families, so their agreement
// means more than one model asked twice. Rates are Neurons per million
// tokens (developers.cloudflare.com/workers-ai/platform/pricing/, read
// 2026-11-22). Mistral answers in JSON because its prompt asks; Llama has a
// JSON schema.
export const TAG_MODELS = [
  { name: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", input: 26_668, output: 204_805, jsonSchema: true },
  { name: "@cf/mistralai/mistral-small-3.1-24b-instruct", input: 31_876, output: 50_488, jsonSchema: false },
] as const;
type TagModel = (typeof TAG_MODELS)[number];

export interface TaggerSettings {
  accountId: string;
  token: string;
}

export type Usage = { prompt_tokens?: number; completion_tokens?: number };
export const neuronsFor = (model: TagModel, usage: Usage | undefined) =>
  ((usage?.prompt_tokens ?? 0) * model.input + (usage?.completion_tokens ?? 0) * model.output) / 1_000_000;

// The tags both models agree on, and the Neurons used. Throws a
// ProviderError: with status 429 when Workers AI turns requests away for now,
// such as today's free Neurons running out or a busy model (the queue stops;
// its detail says which), and invalid when a model's answer can't be read (the
// sentence is tried again on a later run).
export async function tagShow(
  show: string,
  { accountId, token }: TaggerSettings,
  signal: AbortSignal
): Promise<{ tags: SenseTag[]; neurons: number; answers: Map<string, SenseKey>[] }> {
  let neurons = 0;
  const answers: Map<string, SenseKey>[] = [];
  for (const model of TAG_MODELS) {
    const body = (await postJson(
      runUrl(accountId, model.name),
      token,
      {
        messages: [
          { role: "system", content: model.jsonSchema ? TAG_INSTRUCTIONS : TAG_INSTRUCTIONS + ANSWER_AS_JSON },
          { role: "user", content: tagMessage(show) },
        ],
        ...(model.jsonSchema ? { response_format: { type: "json_schema", json_schema: TAG_SCHEMA } } : {}),
        // Same answer for the same sentence, and nothing long
        temperature: 0,
        max_tokens: 300,
      },
      signal,
      { statusOf, detailOf: errorDetail }
    )) as { success?: boolean; result?: { response?: unknown; usage?: Usage } } | null;
    if (isOutOfNeurons(body)) throw new ProviderError("Out of free Neurons", 429, false, errorDetail(body));
    if (!body || body.success === false || !body.result) {
      throw new ProviderError("Unexpected answer from Workers AI", undefined, false, errorDetail(body));
    }
    neurons += neuronsFor(model, body.result.usage);
    const tags = readTags(body.result.response, show);
    if (!tags) throw new ProviderError(`Couldn't read ${model.name}'s answer`, undefined, true);
    answers.push(tags);
  }
  // Each model's own answer too, for the weekly measure (Stage A4)
  return { tags: agreedTags(show, answers[0], answers[1]), neurons, answers };
}
