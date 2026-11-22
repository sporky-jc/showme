// Words the sense tagger never lights up, whatever the models say (Stage A
// of tasks/sense-words-plan.md). Copies of the website's own lists, kept in
// step by client/src/taggerBlocked.test.ts, since the backend can't import
// the website's code:
// - FEELING_WORDS and NEVER_ADD: client/scripts/senseWordJob.ts
// - TELLING_WORDS: client/src/senses.ts's TELL_WORDS, less the ones that
//   are sense words too ("cold", "loud", "dark"), which can show a sense
//
// All lower case. A form of a word is blocked too (blockedWord below).

export const FEELING_WORDS = new Set(
  (
    "afraid angry annoyed anxious ashamed bored brave calm cheerful confused content curious " +
    "delighted depressed disappointed disgusted embarrassed excited fearful frightened frustrated " +
    "furious glad grateful grumpy guilty happy hopeful hurt jealous joyful lonely loved mad " +
    "miserable nervous overjoyed panicked proud relieved sad scared shocked shy sorry stressed " +
    "surprised terrified thankful thrilled tired uneasy upset worried"
  ).split(" ")
);

export const NEVER_ADD = new Set(["feeling", "light", "hard", "rich"]);

export const TELLING_WORDS = new Set(
  (
    "happy happier happiest happily sad sadly mad angry scared afraid excited bored boring fun " +
    "good great bad nice pretty beautiful ugly big small little huge tiny messy clean tired rich " +
    "poor fast slow delicious gross hard easy scary funny cute brave hungry sick hurt hurts"
  ).split(" ")
);

const ALL = [FEELING_WORDS, NEVER_ADD, TELLING_WORDS];

// The word, or the word less a common ending (-s, -es, -ed, -d, -ing, -ly,
// -er, -est, -ness), so "feelings", "prouder" and "nervously" are blocked too
const readings = (word: string) => {
  const found = new Set([word]);
  for (const ending of ["s", "es", "ed", "d", "ing", "ly", "er", "est", "ness"]) {
    if (word.endsWith(ending) && word.length - ending.length >= 3) {
      const stem = word.slice(0, -ending.length);
      found.add(stem);
      found.add(stem + "e");
      // happily → happy, prettier → pretty
      if (stem.endsWith("i")) found.add(stem.slice(0, -1) + "y");
      // sadder → sad
      if (stem.length > 3 && stem.at(-1) === stem.at(-2)) found.add(stem.slice(0, -1));
    }
  }
  return found;
};

export const blockedWord = (word: string) => {
  const lower = word.toLowerCase();
  return [...readings(lower)].some((reading) => ALL.some((list) => list.has(reading)));
};
