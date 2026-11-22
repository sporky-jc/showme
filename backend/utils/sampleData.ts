// Made-up students and sentences for the practice database (ShowME-dev),
// which local testing and staging share, so every page has realistic things
// to show: the Gallery, a student's My sentences, and the Teacher page with
// Scribbles' notes of every kind. Written by scripts/seed-dev.ts. None of it
// was written by a real student.
//
// Only ever deletes what it created itself: profiles with an email ending in
// SEED_DOMAIN, their sentences, and Scribbles' suggestions for those.
import type { Types } from "mongoose";
import Profile from "../models/profile.js";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import tellList from "../public/tellList.js";
import { PRAISE, type TipId } from "../reviewer/tips.js";

export const SEED_DOMAIN = "@seed.example";

// `id` plays the part of the Google account id
export const SAMPLE_STUDENTS = [
  { id: "seed-mia", firstName: "Mia", lastName: "Torres" },
  { id: "seed-leo", firstName: "Leo", lastName: "Chen" },
  { id: "seed-ava", firstName: "Ava", lastName: "Patel" },
  { id: "seed-noah", firstName: "Noah", lastName: "Kim" },
  { id: "seed-sofia", firstName: "Sofia", lastName: "Rossi" },
  { id: "seed-eli", firstName: "Eli", lastName: "Johnson" },
  { id: "seed-zoe", firstName: "Zoe", lastName: "Nguyen" },
  { id: "seed-omar", firstName: "Omar", lastName: "Haddad" },
] as const;

type StudentId = (typeof SAMPLE_STUDENTS)[number]["id"];

// approved: in the Gallery, with Scribbles' praise on My sentences
// redo: sent back by the teacher, with the tip they chose (or none)
// waiting: in the Teacher page's queue. Scribbles reviews these (with
//   scripts/seed-dev.ts --review, or the scheduled reviewer on staging); each
//   is written for one kind of note, named after it.
type Waiting = "ready" | "spelling" | "capitals" | "punctuation" | "grammar" | "off-topic" | "personal" | "check-in" | "your-call";
export type SampleState = { approved: true } | { redo: TipId | null } | { waiting: Waiting };

// [student, day of the Tell (tellList), show sentence, state]
type SampleSentence = [student: StudentId, day: number, show: string, state: SampleState];

export const SAMPLE_SENTENCES: SampleSentence[] = [
  // Approved, for the Gallery
  ["seed-mia", 1, "Frost crawled across the window as my breath hung in the air like a ghost.", { approved: true }],
  ["seed-mia", 2, "The sidewalk shimmered, and my ice cream surrendered before I could take a bite.", { approved: true }],
  ["seed-mia", 3, "Mountains of socks blocked the doorway, and a forgotten sandwich had grown fur.", { approved: true }],
  ["seed-leo", 1, "My fingers went numb inside my gloves before I reached the bus stop.", { approved: true }],
  ["seed-leo", 2, "Sweat dripped off my nose and sizzled on the burning pavement.", { approved: true }],
  ["seed-ava", 1, "Icicles hung from the roof like a row of glass teeth.", { approved: true }],
  ["seed-ava", 2, "The dog refused to leave the shade, panting like he had run a marathon.", { approved: true }],
  ["seed-noah", 1, "Our car would not start, and the snow reached the top of the tires.", { approved: true }],
  ["seed-sofia", 4, "Her pencils were lined up by color, and the window sparkled in the sun.", { approved: true }],
  ["seed-sofia", 5, "Our footsteps echoed down a hallway with so many doors that I lost count.", { approved: true }],
  ["seed-eli", 6, "We bumped elbows at the tiny table, and the couch was also my bed.", { approved: true }],
  ["seed-eli", 7, "Music thumped through the floor while confetti stuck to our sweaty faces.", { approved: true }],
  ["seed-zoe", 8, "The clock ticked so slowly that I counted every tile on the ceiling twice.", { approved: true }],
  ["seed-zoe", 9, "My eyelids felt like heavy curtains, and I yawned until my jaw cracked.", { approved: true }],
  ["seed-omar", 10, "I flipped my pillow to the cool side for the hundredth time and stared at the ceiling.", { approved: true }],
  ["seed-omar", 11, "Gold coins spilled from his pockets, and his crown sparkled with rubies.", { approved: true }],
  // Smell, taste and hear too, so the Gallery's sense finder has some of
  // every sense to show
  ["seed-leo", 20, "The spicy noodles made my tongue tingle, and I slurped up every last drop.", { approved: true }],
  ["seed-ava", 20, "Garlic bread smelled so good that my stomach growled before Mom set the table.", { approved: true }],
  ["seed-noah", 21, "The milk tasted sour, and the soggy carrots smelled like an old gym bag.", { approved: true }],
  ["seed-sofia", 22, "I could only see the glow of one streetlight, and the air felt damp on my cheeks.", { approved: true }],
  ["seed-eli", 23, "Purple and yellow flowers lined the path, and the air smelled sweet like honey.", { approved: true }],
  ["seed-zoe", 25, "The hallway was so dark that every creak of the floor made me jump.", { approved: true }],
  ["seed-omar", 29, "Fireworks boomed over the lake while the smoky smell of hot dogs drifted past.", { approved: true }],
  ["seed-mia", 30, "I hum my favorite song while I paint, and the fresh smell of the paint makes me smile.", { approved: true }],
  ["seed-leo", 27, "My puppy's fluffy ears flop when she sniffs my shoes and licks my salty fingers.", { approved: true }],
  ["seed-ava", 26, "My pencil squeaked as I erased my answer again, and my palms were sweaty.", { approved: true }],
  ["seed-noah", 19, "Thunder cracked on the screen, and I hid behind a pillow that smelled like popcorn.", { approved: true }],
  ["seed-sofia", 32, "The soup was lava, and my tongue sizzled like bacon in a pan.", { approved: true }],
  ["seed-eli", 24, "Every step felt like a sharp pin poking my knee, and I bit my lip so I wouldn't cry.", { approved: true }],

  // Sent back by the teacher, each with a tip (or none), for My sentences
  ["seed-leo", 3, "His room is very messy.", { redo: "showNotTell" }],
  ["seed-noah", 2, "It is really hot and I am hot.", { redo: "feel" }],
  ["seed-sofia", 7, "The party was fun and everyone had fun.", { redo: "action" }],
  ["seed-eli", 5, "The house was super big", { redo: "endMark" }],
  ["seed-zoe", 10, "i can not sleep at all", { redo: "capitals" }],
  ["seed-omar", 12, "The students were loud.", { redo: null }],

  // Waiting for the teacher, one for each kind of Scribbles note
  ["seed-mia", 4, "Every book stood in a straight line, and the carpet still had vacuum stripes.", { waiting: "ready" }],
  ["seed-ava", 7, "Balloons bumped the ceiling while we danced until our sneakers squeaked.", { waiting: "ready" }],
  ["seed-noah", 12, "Desks screeched, paper airplanes flew, and Ms. Lee's whistle was lost in the roar.", { waiting: "ready" }],
  ["seed-leo", 8, "The clock ticked so slowley that I counted every crack in the cieling.", { waiting: "spelling" }],
  ["seed-sofia", 9, "my eyes kept closing and i yawned so wide my jaw cracked", { waiting: "capitals" }],
  ["seed-eli", 1, "The wind howled ,and the trees bent.My hat flew away.", { waiting: "punctuation" }],
  ["seed-zoe", 2, "We was so hot that the ice cream melt before we can eat it.", { waiting: "grammar" }],
  ["seed-omar", 5, "My little brother got a new red bike for his birthday.", { waiting: "off-topic" }],
  ["seed-mia", 7, "Come to my party at 42 Maple Street on Saturday!", { waiting: "personal" }],
  // So the teacher sees how Scribbles holds a sentence that may mean a
  // student needs help: the rules catch it, and no AI ever reads it
  ["seed-ava", 10, "I can't fall asleep because nobody would miss me if I was gone.", { waiting: "check-in" }],
  ["seed-noah", 11, "The king's castle had gold doors.", { waiting: "your-call" }],
];

const HOUR = 60 * 60 * 1000;

// Replaces the previous sample data with SAMPLE_SENTENCES. Returns the
// waiting sentences' ids, for Scribbles to review.
export const seedSampleData = async (now = Date.now()) => {
  const old = await Profile.find({ email: { $regex: `${SEED_DOMAIN.replace(".", "\\.")}$` } });
  const oldSentences = (
    await Sentence.find({ GID: { $in: old.map((p) => p.id) } }, { _id: 1 }).lean<{ _id: Types.ObjectId }[]>()
  ).map((s) => s._id);
  await ReviewSuggestion.deleteMany({ sentence: { $in: oldSentences } });
  await Sentence.deleteMany({ _id: { $in: oldSentences } });
  await Profile.deleteMany({ _id: { $in: old.map((p) => p._id) } });

  const profiles = new Map<string, InstanceType<typeof Profile>>();
  for (const student of SAMPLE_STUDENTS) {
    profiles.set(
      student.id,
      await Profile.create({ ...student, email: `${student.firstName.toLowerCase()}${SEED_DOMAIN}` })
    );
  }

  const waiting: Types.ObjectId[] = [];
  // Spread over the last few weeks, oldest first, so sorting has something
  // to sort; the waiting ones are the newest, like real work in progress
  for (const [index, [studentId, day, show, state]] of SAMPLE_SENTENCES.entries()) {
    const author = profiles.get(studentId)!;
    const approved = "approved" in state;
    const tip = approved ? PRAISE : "redo" in state ? state.redo : null;
    const sentence = await Sentence.create({
      title: `day${day}`,
      tell: tellList[day - 1].tell,
      show,
      author: author._id,
      GID: author.id,
      approved,
      toRedo: "redo" in state,
      ...(tip ? { tip } : {}),
      createdAt: new Date(now - (SAMPLE_SENTENCES.length - index) * 12 * HOUR),
    });
    author.ownSentences.push(sentence._id);
    if ("waiting" in state) waiting.push(sentence._id);
    // Likes, so the Gallery shows counts other than 1: between none and all
    // of the other students like each one (students can't like their own)
    if (approved) {
      const others = SAMPLE_STUDENTS.filter((s) => s.id !== studentId);
      sentence.likedBy = others.slice(0, index % (others.length + 1)).map((s) => profiles.get(s.id)!._id);
      await sentence.save();
    }
  }
  await Promise.all([...profiles.values()].map((p) => p.save()));
  return { students: profiles.size, waiting };
};

// Sample sentences for one real staging account (yours), so signing in with
// it shows every state on My sentences, next to the sample students' work
// on the Teacher page and in the Gallery. [day of the Tell, show, state]
type DemoSentence = [day: number, show: string, state: SampleState];
export const DEMO_SENTENCES: DemoSentence[] = [
  [13, "He sprinted up the stairs just as the train doors hissed shut in his face.", { approved: true }],
  [18, "Puddles swallowed the sidewalk, and our soccer ball floated down the gutter.", { approved: true }],
  [20, "The meal was very good.", { redo: "taste" }],
  [21, "The mashed potatos were gray, and the milk smeled sour.", { redo: "spelling" }],
  [22, "It was foggy.", { redo: null }],
  [23, "Red tulips, orange lilies and purple violets crowded the garden like a box of crayons.", { waiting: "ready" }],
  [25, "I could not see my own hand, and the only lihgt came from the moon.", { waiting: "spelling" }],
];

// Gives the account with this email the demo sentences and makes it a
// teacher, replacing the demo sentences it got before (found by their exact
// words, so its own sentences are never touched). A Tell it already wrote a
// sentence for is skipped. The account must have signed in once. Run after
// seedSampleData, so the sample students can like its approved sentences.
export const seedDemoAccount = async (email: string, now = Date.now()) => {
  const profile = await Profile.findOne({ email });
  if (!profile) return null;

  const demoShows = DEMO_SENTENCES.map(([, show]) => show);
  const old = (
    await Sentence.find({ GID: profile.id, show: { $in: demoShows } }, { _id: 1 }).lean<{ _id: Types.ObjectId }[]>()
  ).map((s) => s._id);
  await ReviewSuggestion.deleteMany({ sentence: { $in: old } });
  await Sentence.deleteMany({ _id: { $in: old } });
  const oldIds = new Set(old.map(String));
  profile.set(
    "ownSentences",
    profile.ownSentences.filter((id) => !oldIds.has(String(id)))
  );

  const taken = new Set(
    (await Sentence.find({ GID: profile.id }, { title: 1 }).lean<{ title: string }[]>()).map((s) => s.title)
  );
  const likers = await Profile.find({ email: { $regex: `${SEED_DOMAIN.replace(".", "\\.")}$` } }, { _id: 1 })
    .limit(3)
    .lean<{ _id: Types.ObjectId }[]>();

  const waiting: Types.ObjectId[] = [];
  let added = 0;
  let skipped = 0;
  for (const [index, [day, show, state]] of DEMO_SENTENCES.entries()) {
    if (taken.has(`day${day}`)) {
      skipped++;
      continue;
    }
    const approved = "approved" in state;
    const tip = approved ? PRAISE : "redo" in state ? state.redo : null;
    const sentence = await Sentence.create({
      title: `day${day}`,
      tell: tellList[day - 1].tell,
      show,
      author: profile._id,
      GID: profile.id,
      approved,
      toRedo: "redo" in state,
      ...(tip ? { tip } : {}),
      likedBy: approved ? likers.map((p) => p._id) : [],
      createdAt: new Date(now - (DEMO_SENTENCES.length - index) * 6 * HOUR),
    });
    profile.ownSentences.push(sentence._id);
    if ("waiting" in state) waiting.push(sentence._id);
    added++;
  }
  profile.isAdmin = true;
  await profile.save();
  return { added, skipped, waiting };
};
