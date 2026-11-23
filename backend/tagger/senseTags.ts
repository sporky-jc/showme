// The sense tagger's rules (Stage A of tasks/sense-words-plan.md), pure
// functions only: what the two models are asked, how their answers are read,
// and which words light up. tagger.ts sends the requests; queue.ts runs it on
// approved sentences.
//
// A word lights up only when:
// - it's a word of the kid's own sentence, one we asked about (nothing a
//   model writes is shown);
// - both models give it the same sense;
// - it isn't a feelings word, a telling word or in NEVER_ADD (blocked.ts).
import { blockedWord } from "./blocked.js";

export const SENSE_KEYS = ["see", "hear", "feel", "smell", "taste"] as const;
export type SenseKey = (typeof SENSE_KEYS)[number];
export type SenseTag = { word: string; sense: SenseKey };

// What both models are told. A closed question: our code picks the words
// (wordsToLabel) and both models label every one, so their answers are about
// the same words and can be compared word by word. (An open "list the sense
// words" let a model stay quiet: on the made-up set Llama named 19 words in
// 97 sentences and Mistral 178, so they agreed on almost nothing.) Same task,
// same answer form; they're different model families (tagger.ts), which is
// what makes agreement worth something.
//
// Each label also says whether it's clear (most teachers would mark it
// without arguing) or a judgment call. The examples are never from the
// practice sets (client/src/test/), so the measure stays fair. Only clear labels count (readLabels):
// on the made-up set, the models' extra highlights were mostly judgment
// calls ("crunchy chips" as a sound) or a thing's name ("the roses" as see),
// and a missing highlight costs a kid less than a wrong one.
export const LABEL_INSTRUCTIONS = `You help a writing app for kids in grades 4 to 7. A kid wrote a "show, don't tell" sentence. For each word in the list, say which of the five senses it shows in this sentence, the way a teacher would mark it, or none:
- see: sight, colors, light, shapes, how something looks
- hear: sounds, voices, noises
- feel: touch, temperature, pain, how the body feels
- smell
- taste
- none: it shows no sense here

Rules:
- Give every word in the list one label, and only those words.
- Decide each word by how it's used in this sentence, with the words around it: "sweet perfume" is smell, "sweet cake" is taste.
- Label the words that describe what's seen, heard, felt, smelled or tasted, not the thing itself. A thing's name or a body part alone is none: "the roses", "rain", "my chin", "the house".
- A word that only tells a feeling inside (happy, scared, proud, nervous) or only judges (good, nice, gross, delicious) is none.
- Say clear: true only when most teachers would mark it that way without arguing. If it's a judgment call, say clear: false.

Examples:
- "Sharp sleet stung my nose.": sharp feel (clear), sleet none, stung feel (clear), nose none.
- "The lilacs gave off a sweet smell.": lilacs none, gave none, sweet smell (clear), smell smell (clear).
- "The toast was buttery and crunchy.": toast none, buttery taste (clear), crunchy hear (not clear: it's mostly about the taste).
- "Our dog snored on my feet.": dog none, snored hear (clear), feet none.`;

// For a model without a JSON schema option: the answer form, in words
export const ANSWER_AS_JSON = `\n\nAnswer only with JSON, nothing else, like this: {"labels": [{"word": "crunched", "sense": "hear", "clear": true}, {"word": "door", "sense": "none", "clear": true}]}`;

export const LABEL_SCHEMA = {
  type: "object",
  properties: {
    labels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          sense: { type: "string", enum: [...SENSE_KEYS, "none"] },
          clear: { type: "boolean" },
        },
        required: ["word", "sense", "clear"],
      },
    },
  },
  required: ["labels"],
};

export const labelMessage = (show: string, words: readonly string[]) => `Sentence: ${show}\nWords: ${words.join(", ")}`;

// Small words that never show a sense, so they aren't asked about
export const SMALL_WORDS = new Set(
  (
    "a an the and or but so if then than as of to in on at by for from with into onto over under " +
    "up down out off about through after before while until because i me my mine we us our you your " +
    "he him his she her it its they them their this that these those there here who what when where " +
    "why how is am are was were be been being do does did have has had can could will would should " +
    "may might must not no yes all some any each every just very too also again i'm it's i'd"
  ).split(" ")
);

// At most this many words a sentence, so an answer is never long
export const MOST_WORDS = 20;

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

// The words to ask both models about: the sentence's own words, once each,
// in order, less small words and blocked ones (which never light up anyway)
export function wordsToLabel(show: string): string[] {
  const words = new Set(wordsOf(show).filter((word) => word.replace(/'/g, "").length > 1 && !SMALL_WORDS.has(word) && !blockedWord(word)));
  return [...words].slice(0, MOST_WORDS);
}

// One model's labels, as word → sense, keeping only the asked words with a
// sense the model is clearly sure of (none, and judgment calls, left out;
// so is a label that doesn't say clear: true). The first answer for each
// word counts. Null when the answer can't be read at all (not the same as
// "no sense words").
export function readLabels(response: unknown, asked: readonly string[]): Map<string, SenseKey> | null {
  const parsed = typeof response === "string" ? lenientJson(response) : response;
  const labels = (parsed as { labels?: unknown } | null)?.labels;
  if (!Array.isArray(labels)) return null;
  const askedWords = new Set(asked);
  const seen = new Set<string>();
  const found = new Map<string, SenseKey>();
  for (const entry of labels as { word?: unknown; sense?: unknown; clear?: unknown }[]) {
    const word = typeof entry?.word === "string" ? entry.word.trim().toLowerCase().replace(/[’‘]/g, "'") : "";
    if (!askedWords.has(word) || seen.has(word)) continue;
    seen.add(word);
    if (SENSE_KEYS.includes(entry.sense as SenseKey) && entry.clear === true) found.set(word, entry.sense as SenseKey);
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
