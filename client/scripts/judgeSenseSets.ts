// The judge panel's rules (Stage A7 of tasks/sense-words-plan.md): which
// senses a practice sentence may fairly show besides the ones it's labeled
// with, decided by three AI families other than the tagger's, so no person
// decides and the AI being measured doesn't grade itself. Pure functions;
// scripts/judge-sense-sets.ts sends the requests. Tested in
// src/judgeSenseSets.test.ts.
//
// Strict on purpose: a sense is a judgment call ("may") only if every judge
// says most teachers would accept it. Any doubt, or an answer that can't be
// read, counts as no, so it counts against the tagger, never for it.
import { SENSE_KEYS, type SenseKey } from "../src/senses";

// Neurons per million tokens (developers.cloudflare.com/workers-ai/platform/pricing/,
// read 2026-11-23). None marked deprecated in Cloudflare's model catalog
// then (Qwen 3 was retired on 2026-11-20, while still listed: check the
// model's own page before swapping one in).
export const JUDGES = [
  { name: "@cf/google/gemma-4-26b-a4b-it", input: 9_091, output: 27_273 },
  { name: "@cf/zai-org/glm-4.7-flash", input: 5_500, output: 36_400 },
  { name: "@cf/openai/gpt-oss-120b", input: 31_818, output: 68_182 },
] as const;
export type Judge = (typeof JUDGES)[number];

export const JUDGE_INSTRUCTIONS = `You help a writing app for kids in grades 4 to 7 check its answer key. A kid wrote a "show, don't tell" sentence. The answer key says which of the five senses (see, hear, feel, smell, taste) it clearly shows. For each other sense you're given, say whether most grade 4 to 7 teachers would accept that the sentence also shows that sense.

A sentence shows a sense when its words tell the reader what someone sees, hears, feels (touch, temperature, pain, the body), smells or tastes. Judge by how the words are used in this sentence: "sweet perfume" is smell, "sweet cake" is taste.

Say no when:
- the sense only comes from the name of a thing ("roses", "rain", "my chin", "the house"), not from words describing it;
- it's only a feeling inside (happy, scared, nervous) or a judgment (good, nice, gross);
- you'd have to imagine it, or teachers would disagree.

Answer only with JSON, nothing else, like this: {"answers": [{"sense": "hear", "accept": true}, {"sense": "see", "accept": false}]}`;

// The senses to ask about: every one the labels leave out
export const sensesToAsk = (must: readonly SenseKey[]): SenseKey[] => SENSE_KEYS.filter((sense) => !must.includes(sense));

export const judgeMessage = (show: string, must: readonly SenseKey[], ask: readonly SenseKey[]) =>
  `Sentence: ${show}\nIt clearly shows: ${must.length ? must.join(", ") : "none"}\nJudge these senses: ${ask.join(", ")}`;

// A model's answer text, from whichever shape its Workers AI result has:
// { response } (text or already JSON), chat completions ({ choices }), or
// responses ({ output_text } or { output: [{ content: [{ text }] }] }). Any
// thinking (<think>...</think>) is left out.
export function answerText(result: unknown): string {
  const r = result as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
    output_text?: unknown;
    output?: { type?: string; content?: { text?: unknown }[] }[];
  } | null;
  let text: unknown = "";
  if (r?.response !== undefined) text = typeof r.response === "string" ? r.response : JSON.stringify(r.response);
  else if (r?.choices?.[0]?.message?.content !== undefined) text = r.choices[0].message.content;
  else if (typeof r?.output_text === "string") text = r.output_text;
  else if (Array.isArray(r?.output)) {
    const message = r.output.filter((part) => part.type !== "reasoning").at(-1);
    text = message?.content?.map((part) => part.text).find((part) => typeof part === "string") ?? "";
  }
  return typeof text === "string" ? text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() : "";
}

function lenientJson(text: string): unknown {
  for (const candidate of [text, text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next reading
    }
  }
  return null;
}

// One judge's yes or no for each asked sense (the first answer for each).
// Null when the answer can't be read at all.
export function readVerdicts(text: string, asked: readonly SenseKey[]): Map<SenseKey, boolean> | null {
  const answers = (lenientJson(text) as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers)) return null;
  const verdicts = new Map<SenseKey, boolean>();
  for (const entry of answers as { sense?: unknown; accept?: unknown }[]) {
    const sense = typeof entry?.sense === "string" ? (entry.sense.trim().toLowerCase() as SenseKey) : null;
    if (!sense || !asked.includes(sense) || verdicts.has(sense) || typeof entry.accept !== "boolean") continue;
    verdicts.set(sense, entry.accept);
  }
  return verdicts;
}

// The senses every judge accepted. A judge whose answer couldn't be read,
// or that didn't answer for a sense, counts as no.
export const unanimous = (asked: readonly SenseKey[], verdicts: readonly (Map<SenseKey, boolean> | null)[]): SenseKey[] =>
  asked.filter((sense) => verdicts.length > 0 && verdicts.every((judge) => judge?.get(sense) === true));

// The frozen file (src/test/senseMay.ts), with when and by whom
export function mayFile(may: Readonly<Record<string, readonly SenseKey[]>>, date: string): string {
  const entries = Object.entries(may).filter(([, senses]) => senses.length > 0);
  return `import type { SenseKey } from "../senses";

// The judgment calls in the practice sets (test/senseSet.ts and
// test/senseHeldOut.ts): senses a sentence doesn't mainly show, but that a
// teacher could fairly accept ("The chips were salty and crunchy." shows
// taste, and crunchy is also a sound). Scoring counts them neither right nor
// wrong (test/senseScoring.ts), so a defensible extra highlight isn't a
// mistake, and the bar for real mistakes stays as strict.
//
// Nobody picks these by hand, and the AI being scored doesn't either: a
// panel of three other AI families decides, each asked about every sense a
// sentence's labels leave out, and only a unanimous yes counts (the "Judge
// the sense practice sets" workflow, scripts/judge-sense-sets.ts). Change it
// only by running the panel again, never by hand.
//
// Decided ${date} by ${JUDGES.map(({ name }) => name).join(", ")}:
// ${entries.length} sentences with judgment calls.
export const SENSE_MAY: Readonly<Record<string, readonly SenseKey[]>> = {
${entries.map(([show, senses]) => `  ${JSON.stringify(show)}: [${senses.map((sense) => JSON.stringify(sense)).join(", ")}],`).join("\n")}
};
`;
}
