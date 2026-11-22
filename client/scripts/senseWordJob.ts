// The weekly sense word job's logic (S3 of tasks/sense-words-plan.md):
// which words to ask the AI about, the two ways of asking, which answers to
// trust, and the file the trusted words go in. scripts/sense-words.ts runs
// it; src/senseWordJob.test.ts tests it.
//
// Only single words are ever sent to the AI, never a sentence.
import { SENSE_KEYS, type SenseKey, baseForms, senseWords } from "../src/senses";

export type WordCount = { word: string; sentences: number };
export type Kind = "doing" | "describing";
export type Answer = { word: string; sense: SenseKey | "none"; kind?: Kind; base?: string };
export type Added = Record<SenseKey, { words: readonly string[]; describing: readonly string[] }>;
// A word to add: its base (what goes in the list), the word kids wrote,
// its sense and kind, and how many approved sentences have it
export type Trusted = { word: string; written?: string; sense: SenseKey; kind: Kind; sentences: number };

// The most words asked about in one run, and in one request
export const MAX_WORDS = 400;
export const PER_REQUEST = 50;

// Words the job never adds, even if the AI says they use a sense: they mean
// something else too often in kids' writing. Add a word here to take it back
// out of src/senseWordsAdded.ts for good.
export const NEVER_ADD = new Set(["feeling", "feels", "light", "hard", "rich", "dark"]);

// Everyday words that never use a sense, so the AI isn't asked about them
// every week
const NOT_SENSES = new Set(
  (
    "the and was were are is has had have his her him she they them their our you your its this that " +
    "these those with from for but not all any some one two three into onto over under out off about " +
    "after before then than when while what where who why how which there here very really just like " +
    "made make got get went came come said says could would should will can did does done been being " +
    "him himself herself myself because until again also only even still much many more most other " +
    "every each first last next way day days time times back down away around through across behind " +
    "little big small long new old good bad best better lot lots thing things people mom dad home"
  ).split(" ")
);

// The words worth asking about: in enough approved sentences (the counts
// only hold those), not already found by the list, and not ruled out
export function wordsToAsk(counts: readonly WordCount[]): WordCount[] {
  return counts
    .filter(({ word }) => !NOT_SENSES.has(word) && !NEVER_ADD.has(word))
    .filter(({ word }) => Object.values(senseWords(word)).every((found) => found === null))
    .slice(0, MAX_WORDS);
}

export const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

// The first way of asking: which sense, and what kind of word
export const ASK_SENSE_AND_KIND = `You help a writing app for kids in grades 4 to 7 light up the words in their sentences that use one of the five senses.

For each word in the list, say which sense it almost always uses when a kid writes it in a story:
- see: sight, colors, light, shapes
- hear: sounds, voices, noises
- feel: touch, temperature, pain, how the body feels
- smell
- taste
If the word is not almost always about one of these, or it only tells a feeling inside like happy, nervous or proud, say none.

Also say what kind of word it is: "describing" for a describing word (an adjective or adverb, like loud, sticky or brightly), or "doing" for a doing or naming word (a verb or noun, like scream or stench).

And give its base: the plain form of the word, without -s, -es, -ed, -ing, -er, -est or -ly (screamed: scream, crashes: crash, louder: loud). If it is already plain, the base is the word itself.

Answer for every word in the list, and only those words.`;

// The second way of asking, put differently, so a word only counts when
// both agree
export const ASK_TEACHER = `A teacher reads short "show, don't tell" sentences written by kids in grades 4 to 7, and marks which of the five senses each sentence uses: see, hear, feel (touch, temperature, pain), smell or taste.

Imagine each word below used in ten different sentences by different kids. In at least nine of the ten, which one sense would the teacher mark because of that word? If no single sense would be marked nine times out of ten, answer none. Words about feelings inside, like scared, excited or lonely, are none.

Answer for every word in the list, and only those words.`;

export const wordsMessage = (words: readonly string[]) => `Words:\n${words.join("\n")}`;

const SENSES_OR_NONE = [...SENSE_KEYS, "none"];

export const SENSE_AND_KIND_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          sense: { type: "string", enum: SENSES_OR_NONE },
          kind: { type: "string", enum: ["doing", "describing"] },
          base: { type: "string" },
        },
        required: ["word", "sense", "kind", "base"],
      },
    },
  },
  required: ["answers"],
};

export const TEACHER_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          sense: { type: "string", enum: SENSES_OR_NONE },
        },
        required: ["word", "sense"],
      },
    },
  },
  required: ["answers"],
};

// An AI's answers, keeping only well-formed answers about words it was
// asked about (the first answer for each), whatever else it said
export function readAnswers(response: unknown, asked: readonly string[]): Map<string, Answer> {
  const parsed = typeof response === "string" ? safeJson(response) : response;
  const answers = (parsed as { answers?: unknown } | null)?.answers;
  const found = new Map<string, Answer>();
  if (!Array.isArray(answers)) return found;
  const askedSet = new Set(asked);
  for (const answer of answers as Partial<Answer>[]) {
    const word = typeof answer?.word === "string" ? answer.word.trim().toLowerCase() : "";
    if (!askedSet.has(word) || found.has(word)) continue;
    if (!SENSES_OR_NONE.includes(answer.sense as string)) continue;
    const kind = answer.kind === "doing" || answer.kind === "describing" ? answer.kind : undefined;
    const base = typeof answer.base === "string" ? answer.base.trim().toLowerCase() : undefined;
    found.set(word, { word, sense: answer.sense as Answer["sense"], kind, base });
  }
  return found;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The base to add for a word: the one the AI gave, if the list's own
// spelling rules (baseForms in senses.ts) say the word can be a form of it,
// so "wailed" adds "wail" and its whole family; otherwise the word itself
export function baseOf(word: string, kind: Kind, base: string | undefined): string {
  if (!base || base === word) return word;
  const forms = baseForms(word);
  return (kind === "describing" ? forms.describing : forms.doing).includes(base) ? base : word;
}

// The words both ways of asking gave the same sense (not none), with the
// kind (and base) the first way gave
export function trusted(
  counts: readonly WordCount[],
  senseAndKind: Map<string, Answer>,
  teacher: Map<string, Answer>
): Trusted[] {
  const found: Trusted[] = [];
  for (const { word, sentences } of counts) {
    const first = senseAndKind.get(word);
    const second = teacher.get(word);
    if (!first || !second || first.sense === "none" || first.sense !== second.sense || !first.kind) continue;
    const base = baseOf(word, first.kind, first.base);
    found.push({ word: base, ...(base !== word ? { written: word } : {}), sense: first.sense, kind: first.kind, sentences });
  }
  return found;
}

// The added words with these ones too, each list sorted
export function withWords(added: Added, words: readonly Trusted[]): Added {
  const next = Object.fromEntries(
    SENSE_KEYS.map((sense) => [sense, { words: [...added[sense].words], describing: [...added[sense].describing] }])
  ) as Record<SenseKey, { words: string[]; describing: string[] }>;
  for (const { word, sense, kind } of words) {
    const list = kind === "describing" ? next[sense].describing : next[sense].words;
    if (!list.includes(word)) list.push(word);
  }
  for (const sense of SENSE_KEYS) {
    next[sense].words.sort();
    next[sense].describing.sort();
  }
  return next;
}

// src/senseWordsAdded.ts, written out with these words
export function addedFile(header: string, added: Added): string {
  const list = (words: readonly string[]) => `[${words.map((word) => JSON.stringify(word)).join(", ")}]`;
  const lines = SENSE_KEYS.map(
    (sense) => `  ${sense}: { words: ${list(added[sense].words)}, describing: ${list(added[sense].describing)} },`
  );
  return `${header}export const ADDED_SENSE_WORDS: Record<SenseKey, { words: readonly string[]; describing: readonly string[] }> = {\n${lines.join("\n")}\n};\n`;
}

// The pull request's description
export function report(added: readonly Trusted[], dropped: readonly Trusted[], asked: number, database: string): string {
  const row = ({ word, written, sense, kind, sentences }: Trusted) =>
    `| ${word}${written ? ` (written ${written})` : ""} | ${sense} | ${kind} | ${sentences} |`;
  return [
    `The weekly sense word job asked the free AI about ${asked} words from approved sentences in ${database}, each in at least 3 sentences.`,
    "",
    "Each word below got the same sense when asked twice, in two different ways, and every sense test still passes with it (including the sentences that must light up nothing, and the score in `senseScore.test.ts`).",
    "",
    "| Word | Sense | Kind | Sentences |",
    "|---|---|---|---|",
    ...added.map(row),
    ...(dropped.length > 0
      ? ["", "Left out, because a sense test failed with them:", "", "| Word | Sense | Kind | Sentences |", "|---|---|---|---|", ...dropped.map(row)]
      : []),
    "",
    "To take a word back out for good, add it to `NEVER_ADD` in `client/scripts/senseWordJob.ts`.",
  ].join("\n");
}
