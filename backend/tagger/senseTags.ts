// The sense tagger's rules (Stage A of tasks/sense-words-plan.md), pure
// functions only: what the two models are asked, how their answers are read,
// and which words light up. tagger.ts sends the requests; queue.ts runs it on
// approved sentences.
//
// A word lights up only when:
// - it's a word of the kid's own sentence (nothing a model writes is shown);
// - both models give it the same sense;
// - it isn't a feelings word, a telling word or in NEVER_ADD (blocked.ts).
import { blockedWord } from "./blocked.js";

export const SENSE_KEYS = ["see", "hear", "feel", "smell", "taste"] as const;
export type SenseKey = (typeof SENSE_KEYS)[number];
export type SenseTag = { word: string; sense: SenseKey };

// What both models are told. Same task, same answer form, so their answers
// can be compared; they're different model families (tagger.ts), which is
// what makes agreement worth something.
export const TAG_INSTRUCTIONS = `You help a writing app for kids in grades 4 to 7. A kid wrote a "show, don't tell" sentence. List the words in it that show one of the five senses, the way a teacher would mark them:
- see: sight, colors, light, shapes, how something looks
- hear: sounds, voices, noises
- feel: touch, temperature, pain, how the body feels
- smell
- taste

Rules:
- Only list words that are in the sentence, exactly as written there, one word each (no phrases).
- Decide each word by how it's used in this sentence: "sweet perfume" is smell, "sweet cake" is taste.
- Leave out words that only tell a feeling inside (happy, scared, proud, nervous) or only judge (good, nice, gross, delicious).
- If no word shows a sense, give an empty list.`;

// For a model without a JSON schema option: the answer form, in words
export const ANSWER_AS_JSON = `\n\nAnswer only with JSON, nothing else, like this: {"words": [{"word": "crunched", "sense": "hear"}]}`;

export const TAG_SCHEMA = {
  type: "object",
  properties: {
    words: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          sense: { type: "string", enum: [...SENSE_KEYS] },
        },
        required: ["word", "sense"],
      },
    },
  },
  required: ["words"],
};

export const tagMessage = (show: string) => `Sentence: ${show}`;

// The words of a sentence, lower case, apostrophes kept ("can't"), as the
// website reads them (client/src/senses.ts, wordsOf)
export const wordsOf = (text: string): string[] =>
  text.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z']+/g) ?? [];

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

// One model's answer, as word → sense, keeping only single words that are
// in the sentence, with a sense key (the first answer for each word). Null
// when the answer can't be read at all (not the same as "no sense words").
export function readTags(response: unknown, show: string): Map<string, SenseKey> | null {
  const parsed = typeof response === "string" ? lenientJson(response) : response;
  const words = (parsed as { words?: unknown } | null)?.words;
  if (!Array.isArray(words)) return null;
  const inSentence = new Set(wordsOf(show));
  const found = new Map<string, SenseKey>();
  for (const entry of words as { word?: unknown; sense?: unknown }[]) {
    const word = typeof entry?.word === "string" ? entry.word.trim().toLowerCase().replace(/[’‘]/g, "'") : "";
    const sense = entry?.sense;
    if (!inSentence.has(word) || found.has(word)) continue;
    if (!SENSE_KEYS.includes(sense as SenseKey)) continue;
    found.set(word, sense as SenseKey);
  }
  return found;
}

// The words both models agree on, in the order they come in the sentence,
// once each, less the blocked ones
export function agreedTags(show: string, first: Map<string, SenseKey>, second: Map<string, SenseKey>): SenseTag[] {
  const tags: SenseTag[] = [];
  for (const word of new Set(wordsOf(show))) {
    const sense = first.get(word);
    if (sense && second.get(word) === sense && !blockedWord(word)) tags.push({ word, sense });
  }
  return tags;
}
