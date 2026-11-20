// Two open-source libraries the rule checks (rules.ts) ask as well, after
// their own checks. Like every rule, they can only hold a sentence for a
// person: a miss here is still caught by our own lists, the AI or the
// teacher, and a false alarm costs the teacher a glance.
//
//   - obscenity: bad words, slurs and adult words, including ones disguised
//     with look-alike letters or stretched out ("fuuuck"). Its list has
//     slurs ours doesn't.
//   - compromise: reads a sentence as English and finds people's names, so
//     a full name is caught even when the first name isn't on our list
//     ("Harry Smith").
//
// Both run here on the server only, with nothing sent anywhere: neither
// reads files, uses the network or runs other programs. Their versions are
// pinned exactly in package.json, so nothing changes until we choose to
// update. Before updating either: take a version at least two weeks old,
// check `npm audit`, install with `--ignore-scripts`, and run these tests.
import nlp from "compromise";
import {
  DataSet,
  englishDataset,
  englishRecommendedTransformers,
  RegExpMatcher,
} from "obscenity";

// Words in obscenity's list that children use in ordinary Show sentences:
// "the cock crowed", "a blue tit sang", "the prick of a thorn", "the cat
// ran off when I said scat". Left out; the teacher reads those.
const ORDINARY_WORDS = new Set(["cock", "tit", "prick", "scat"]);

const matcher = new RegExpMatcher({
  ...new DataSet<{ originalWord: string }>()
    .addAll(englishDataset)
    .removePhrasesIf((phrase) => ORDINARY_WORDS.has(phrase.metadata?.originalWord ?? ""))
    .build(),
  ...englishRecommendedTransformers,
});

// Bad language obscenity knows. Given the text after our own clean-up
// (invisible characters removed, other alphabets' look-alikes mapped).
export const libraryFindsUnsafe = (text: string) => matcher.hasMatch(text);

// Words that come before a name without being part of it: "Mr. Brown", "my
// sister Lily", "Coach Davis", "Grandpa Joe". A title and one name doesn't
// say who a child is; a first and last name does.
const TITLES = new Set([
  "mr", "mrs", "ms", "miss", "mister", "dr", "doctor", "sir", "madam", "coach", "teacher",
  "principal", "officer", "captain", "uncle", "aunt", "auntie", "grandpa", "grandma",
  "granny", "nana", "papa", "mama", "mom", "mommy", "mum", "dad", "daddy", "sister",
  "brother", "cousin", "baby", "little", "big", "old", "my", "our", "his", "her", "their",
  "king", "queen", "prince", "princess", "lady", "lord", "saint", "st",
]);

// A first and last name compromise finds ("Harry Smith", "Sofia Ramirez").
// Given the text with made-up names already taken out, and capitals as the
// child wrote them (names are found by their capitals).
export const libraryFindsFullName = (text: string) => {
  // Shouting in capitals is read as ordinary capitals ("HARRY SMITH")
  const titled = text.replace(/\b[A-Z]{2,}\b/g, (word) => word[0] + word.slice(1).toLowerCase());
  for (const person of nlp(titled).people().out("array") as string[]) {
    const names = person
      .split(/\s+/)
      .map((word) => word.replace(/[^\p{L}'-]/gu, ""))
      .filter((word) => word !== "" && !TITLES.has(word.toLowerCase()));
    if (names.length < 2 || !names.every((name) => /^\p{Lu}/u.test(name))) continue;
    // Not "Max Barked": a word ending in -ed or -ing is something Max did
    if (names.slice(1).some((name) => /(ed|ing)$/i.test(name))) continue;
    return true;
  }
  return false;
};
