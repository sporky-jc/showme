// The weekly sense word job's logic (S3 of tasks/sense-words-plan.md):
// which words to ask the AI about, the two ways of asking, which answers to
// trust, what goes in the file, and the report. scripts/sense-words.ts
// runs it; src/senseWordJob.test.ts tests it.
//
// Only single words are ever sent to the AI here, never a sentence, and
// the report holds words and rounded counts only.
import { SENSE_KEYS, type SenseKey, TELL_WORDS, baseForms, senseWords } from "../src/senses";

export type WordCount = { word: string; sentences: number };
export type Kind = "doing" | "describing";
export type Answer = { word: string; sense: SenseKey | "none"; kind?: Kind; base?: string };
export type Added = Record<SenseKey, { exact: readonly string[]; words: readonly string[]; describing: readonly string[] }>;
// A word to add, and where: "family" adds the base with all its forms,
// "exact" adds only the word as kids wrote it
export type Trusted = {
  word: string;
  written: string;
  sense: SenseKey;
  kind: Kind;
  how: "family" | "exact";
  sentences: number;
};

// The most words asked about in one run (the most used first), and in one
// request
export const MAX_WORDS = 200;
export const PER_REQUEST = 50;
// The most new words one run adds
export const MAX_NEW_WORDS = 5;

// Words the job never adds, nor any word in the same family ("light" also
// blocks "lights" and "lighting"), even if the AI says they use a sense:
// they mean something else too often in kids' writing. Add a word here to
// take it out of src/senseWordsAdded.ts for good; the next run removes it.
export const NEVER_ADD = new Set(["feeling", "light", "hard", "rich"]);

// Words for feelings inside. They tell how someone feels; they never show
// a sense, however a model reads them. (The telling words in senses.ts are
// checked too.)
export const FEELING_WORDS = new Set(
  (
    "afraid angry annoyed anxious ashamed bored brave calm cheerful confused content curious " +
    "delighted depressed disappointed disgusted embarrassed excited fearful frightened frustrated " +
    "furious glad grateful grumpy guilty happy hopeful hurt jealous joyful lonely loved mad " +
    "miserable nervous overjoyed panicked proud relieved sad scared shocked shy sorry stressed " +
    "surprised terrified thankful thrilled tired uneasy upset worried"
  ).split(" ")
);

// Everyday words that never use a sense, so the AI isn't asked about them
// every week
const NOT_SENSES = new Set(
  (
    "the and was were are is has had have his her him she they them their our you your its this that " +
    "these those with from for but not all any some one two three into onto over under out off about " +
    "after before then than when while what where who why how which there here very really just like " +
    "made make got get went came come said says could would should will can did does done been being " +
    "himself herself myself because until again also only even still much many more most other " +
    "every each first last next way day days time times back down away around through across behind " +
    "little big small long new old good bad best better lot lots thing things people mom dad home"
  ).split(" ")
);

// Is a word blocked by this list: the word itself, a form of a listed word,
// or a listed word that's a form of it ("barking" and "bark" block each
// other either way)
const isForm = (word: string, base: string) => {
  const forms = baseForms(word);
  return forms.doing.includes(base) || forms.describing.includes(base);
};
export const blockedBy = (list: ReadonlySet<string>, word: string) =>
  [...list].some((listed) => listed === word || isForm(word, listed) || isForm(listed, word));

// Is this word (as written, or as its base) one the job must never add?
export const isBlocked = (word: string) =>
  blockedBy(NEVER_ADD, word) || blockedBy(TELL_WORDS, word) || blockedBy(FEELING_WORDS, word);

// The words worth asking about: in enough approved sentences (the counts
// only hold those), not already found by the list, and not blocked
export function wordsToAsk(counts: readonly WordCount[]): WordCount[] {
  return counts
    .filter(({ word }) => !NOT_SENSES.has(word) && !isBlocked(word))
    .filter(({ word }) => Object.values(senseWords(word)).every((found) => found === null))
    .slice(0, MAX_WORDS);
}

export const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

// The first way of asking: which sense, what kind of word, and its base
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
// asked about (the first answer for each), whatever else it said. Reads
// JSON text leniently (in a code block, or with words around it), for
// models that answer in JSON only because the prompt asks.
export function readAnswers(response: unknown, asked: readonly string[]): Map<string, Answer> {
  const parsed = typeof response === "string" ? lenientJson(response) : response;
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

// The base the AI gave, if the list's own spelling rules (baseForms in
// senses.ts) say the word can be a form of it; otherwise the word itself
export function baseOf(word: string, kind: Kind, base: string | undefined): string {
  if (!base || base === word) return word;
  const forms = baseForms(word);
  return (kind === "describing" ? forms.describing : forms.doing).includes(base) ? base : word;
}

// The words both ways of asking gave the same sense (not none), most used
// first. A word's whole family goes in only when its bare base is one of
// the words kids wrote and passed too (gate 4 in the plan); otherwise only
// the word as written, as an exact word. Nothing blocked goes in, written
// or as its base.
export function trusted(
  counts: readonly WordCount[],
  senseAndKind: Map<string, Answer>,
  teacher: Map<string, Answer>
): Trusted[] {
  const passed = new Map<string, { sense: SenseKey; kind: Kind; base: string; sentences: number }>();
  for (const { word, sentences } of counts) {
    const first = senseAndKind.get(word);
    const second = teacher.get(word);
    if (!first || !second || first.sense === "none" || first.sense !== second.sense || !first.kind) continue;
    const base = baseOf(word, first.kind, first.base);
    if (isBlocked(word) || isBlocked(base)) continue;
    passed.set(word, { sense: first.sense, kind: first.kind, base, sentences });
  }
  const found: Trusted[] = [];
  for (const [written, { sense, kind, base, sentences }] of passed) {
    const bareBase = passed.get(base);
    const family = bareBase !== undefined && bareBase.sense === sense && bareBase.kind === kind;
    found.push(
      family
        ? { word: base, written, sense, kind, how: "family", sentences }
        : { word: written, written, sense, kind, how: "exact", sentences }
    );
  }
  return found;
}

// The added words with these ones too (at most MAX_NEW_WORDS new ones, most
// used first), less any blocked word, each list sorted
export function withWords(added: Added, words: readonly Trusted[]): Added {
  const next = Object.fromEntries(
    SENSE_KEYS.map((sense) => [
      sense,
      {
        exact: added[sense].exact.filter((word) => !isBlocked(word)),
        words: added[sense].words.filter((word) => !isBlocked(word)),
        describing: added[sense].describing.filter((word) => !isBlocked(word)),
      },
    ])
  ) as Record<SenseKey, { exact: string[]; words: string[]; describing: string[] }>;
  let fresh = 0;
  for (const { word, sense, kind, how } of [...words].sort((a, b) => b.sentences - a.sentences)) {
    const list = how === "exact" ? next[sense].exact : kind === "describing" ? next[sense].describing : next[sense].words;
    if (list.includes(word)) continue;
    if (fresh === MAX_NEW_WORDS) break;
    list.push(word);
    fresh += 1;
  }
  for (const sense of SENSE_KEYS) {
    next[sense].exact.sort();
    next[sense].words.sort();
    next[sense].describing.sort();
  }
  return next;
}

// The words in added that aren't in before
export function newWords(before: Added, after: Added): string[] {
  const all = (added: Added) =>
    new Set(SENSE_KEYS.flatMap((sense) => [...added[sense].exact, ...added[sense].words, ...added[sense].describing].map((word) => `${sense}:${word}`)));
  const had = all(before);
  return [...all(after)].filter((entry) => !had.has(entry));
}

// src/senseWordsAdded.ts, written out with these words, one per line
export function addedFile(header: string, added: Added): string {
  const list = (name: string, words: readonly string[]) =>
    words.length === 0 ? `    ${name}: [],` : [`    ${name}: [`, ...words.map((word) => `      ${JSON.stringify(word)},`), "    ],"].join("\n");
  const senses = SENSE_KEYS.map((sense) =>
    [`  ${sense}: {`, list("exact", added[sense].exact), list("words", added[sense].words), list("describing", added[sense].describing), "  },"].join("\n")
  );
  return `${header}export const ADDED_SENSE_WORDS: Record<
  SenseKey,
  { exact: readonly string[]; words: readonly string[]; describing: readonly string[] }
> = {
${senses.join("\n")}
};
`;
}

// A count, rounded, so a report never points at one kid's writing
export const rounded = (sentences: number) => (sentences <= 5 ? "3-5" : sentences <= 10 ? "6-10" : "more than 10");

// The pull request's description: words and rounded counts only
export function report(
  added: readonly Trusted[],
  dropped: readonly Trusted[],
  removed: readonly string[],
  asked: number,
  database: string
): string {
  const row = ({ word, written, sense, kind, how, sentences }: Trusted) =>
    `| ${word}${written !== word ? ` (from ${written})` : ""} | ${sense} | ${how === "family" ? `${kind}, with its family` : "exact"} | ${rounded(sentences)} |`;
  const table = ["| Word | Sense | Added as | Sentences |", "|---|---|---|---|"];
  return [
    `The weekly sense word job asked the free AI about ${asked} words from approved sentences in ${database}, each in at least 3 sentences.`,
    "",
    "Each word below got the same sense when asked twice, in two different ways, and every sense test still passes with it (including the sentences that must light up nothing, and the score in `senseScore.test.ts`).",
    "",
    ...(added.length > 0 ? [...table, ...added.map(row)] : ["No new words this week."]),
    ...(dropped.length > 0 ? ["", "Left out, because a sense test failed with them:", "", ...table, ...dropped.map(row)] : []),
    ...(removed.length > 0 ? ["", `Removed, because they're now in \`NEVER_ADD\`: ${removed.join(", ")}.`] : []),
    "",
    "To take a word back out for good, add it to `NEVER_ADD` in `client/scripts/senseWordJob.ts`.",
  ].join("\n");
}

// The models, in one place. Two different families, so a word only counts
// when models trained apart agree. Rates are Neurons per million tokens
// (developers.cloudflare.com/workers-ai/platform/pricing/, read
// 2026-11-22).
export const MODELS = {
  first: { name: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", input: 26_668, output: 204_805, jsonSchema: true },
  second: { name: "@cf/mistralai/mistral-small-3.1-24b-instruct", input: 31_876, output: 50_488, jsonSchema: false },
} as const;

// The most Neurons one run may use, of the 10,000 free a day
export const NEURON_BUDGET = 3_000;

export const neurons = (model: (typeof MODELS)[keyof typeof MODELS], usage: { prompt_tokens?: number; completion_tokens?: number } | undefined) =>
  ((usage?.prompt_tokens ?? 0) * model.input + (usage?.completion_tokens ?? 0) * model.output) / 1_000_000;

// For a model without a JSON schema: how to answer, in the prompt
export const ANSWER_AS_JSON = `\n\nAnswer only with JSON, nothing else, like this: {"answers": [{"word": "roaring", "sense": "hear"}]}`;

// Cloudflare's "out of today's free Neurons" (error 3036, or the message)
export const isOutOfNeurons = (body: unknown) => {
  const errors = (body as { errors?: unknown } | null)?.errors;
  return (
    Array.isArray(errors) &&
    errors.some(
      (error: { code?: unknown; message?: unknown } | null) =>
        error?.code === 3036 || (typeof error?.message === "string" && /daily free allocation/i.test(error.message))
    )
  );
};
