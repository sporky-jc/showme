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
  LABEL_INSTRUCTIONS,
  LABEL_SCHEMA,
  agreedTags,
  labelMessage,
  readLabels,
  wordsToLabel,
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

// Cloudflare's own count of the Neurons a request used, when its answer
// gives one (usage.neurons); otherwise worked out from the tokens
export type Usage = { prompt_tokens?: number; completion_tokens?: number; neurons?: number };
export const neuronsFor = (model: TagModel, usage: Usage | undefined) =>
  typeof usage?.neurons === "number" && Number.isFinite(usage.neurons) && usage.neurons >= 0
    ? usage.neurons
    : ((usage?.prompt_tokens ?? 0) * model.input + (usage?.completion_tokens ?? 0) * model.output) / 1_000_000;

// The tags both models agree on, and the Neurons used. Throws a
// ProviderError: with status 429 when Workers AI turns requests away for now,
// such as today's free Neurons running out or a busy model (the queue stops;
// its detail says which), and invalid when a model's answer can't be read (the
// sentence is tried again on a later run).
//
// Whatever it throws carries `neuronsSpent`, so a failed sentence still counts
// towards the day's budget (queue.ts): Cloudflare's figure for every answer
// that came back, and a worst case for a request that got none (a timeout,
// a network error), which may still have been charged. A request turned away
// with an error status isn't charged.
export const MAX_TOKENS = 400;
// A generous guess at a request's prompt: the instructions, the sentence and
// up to 20 words
const PROMPT_TOKENS_AT_MOST = 1_000;
const worstCase = (model: TagModel) => neuronsFor(model, { prompt_tokens: PROMPT_TOKENS_AT_MOST, completion_tokens: MAX_TOKENS });

export type TagFailure = Error & { neuronsSpent: number };
const withSpent = (error: unknown, neuronsSpent: number): TagFailure =>
  Object.assign(error instanceof Error ? error : new Error(String(error)), { neuronsSpent });

export async function tagShow(
  show: string,
  { accountId, token }: TaggerSettings,
  signal: AbortSignal
): Promise<{ tags: SenseTag[]; neurons: number; answers: Map<string, SenseKey>[] }> {
  let neurons = 0;
  const answers: Map<string, SenseKey>[] = [];
  // Nothing to ask about ("I was so happy."): no request, no Neurons
  const words = wordsToLabel(show);
  if (words.length === 0) return { tags: [], neurons, answers: TAG_MODELS.map(() => new Map()) };
  for (const model of TAG_MODELS) {
    let answered = false;
    try {
      const body = (await postJson(
        runUrl(accountId, model.name),
        token,
        {
          messages: [
            { role: "system", content: model.jsonSchema ? LABEL_INSTRUCTIONS : LABEL_INSTRUCTIONS + ANSWER_AS_JSON },
            { role: "user", content: labelMessage(show, words) },
          ],
          ...(model.jsonSchema ? { response_format: { type: "json_schema", json_schema: LABEL_SCHEMA } } : {}),
          // Same answer for the same sentence; room for a label for each of
          // up to 20 words (MOST_WORDS)
          temperature: 0,
          max_tokens: MAX_TOKENS,
        },
        signal,
        { statusOf, detailOf: errorDetail }
      )) as { success?: boolean; result?: { response?: unknown; usage?: Usage } } | null;
      answered = true;
      if (isOutOfNeurons(body)) throw new ProviderError("Out of free Neurons", 429, false, errorDetail(body));
      if (!body || body.success === false || !body.result) {
        throw new ProviderError("Unexpected answer from Workers AI", undefined, false, errorDetail(body));
      }
      neurons += neuronsFor(model, body.result.usage);
      const tags = readLabels(body.result.response, words);
      if (!tags) throw new ProviderError(`Couldn't read ${model.name}'s answer`, undefined, true);
      answers.push(tags);
    } catch (error) {
      // An error status from Cloudflare is an answer, and isn't charged; no
      // answer at all may have been
      const refused = error instanceof ProviderError && error.status !== undefined;
      throw withSpent(error, neurons + (answered || refused ? 0 : worstCase(model)));
    }
  }
  // Each model's own answer too, for the weekly measure (Stage A4)
  return { tags: agreedTags(show, answers[0], answers[1]), neurons, answers };
}
