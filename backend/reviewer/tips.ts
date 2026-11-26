// Scribbles' tips: the only words about a sentence that a student will ever
// read from the reviewer. An AI provider never writes feedback of its own;
// it can only pick one of these by its id (see contract.ts), so a confused
// or tricked model has no way to put its own words in front of a child.
//
// Written by people, in Scribbles' voice: short, kind, one idea each, and
// something a student can act on. Change the words freely; keep the ids
// (saved suggestions and the providers' instructions refer to them).

export const TIPS = {
  // What to add
  see: "Add something you would see. What colors or shapes are there?",
  hear: "Add a sound you would hear.",
  feel: "Add how something feels. Is it warm, cold, rough or soft?",
  smell: "Add a smell. What's in the air?",
  taste: "Add a taste, if it fits.",
  senses: "Use your senses! What would you see, hear or feel there?",
  action: "Show someone doing something. What are they doing?",
  compare: "Try comparing it to something, like \"as cold as…\" or \"like a…\"",
  more: "Add a little more. One more detail makes the picture clearer.",

  // How it's written
  showNotTell: "Instead of saying how it is, show what makes it that way.",
  ownWords: "Use your own words, not the Tell sentence.",
  readAloud: "Read it out loud. Does every part make sense?",
  spelling: "Check your spelling. Read each word slowly, letter by letter.",
  capitals: "Start with a capital letter, and write \"I\" as a capital.",
  endMark: "End your sentence with a period, question mark or exclamation mark.",
  punctuation: "Check your commas and periods: put a space after them, not before.",
  // More than one kind of the mistakes above at once (reviewer.ts): one tip
  // for all of them, so they're fixed in one go rather than one per "Try
  // again"
  checkWriting: "Check your spelling, capitals and punctuation. Read it slowly, word by word.",
  onTopic: "Make sure your sentence shows the Tell. What would it look, sound or feel like?",

  // For rude or unkind words (reviewer.ts): only ever suggested once the
  // welfare check has read the sentence and seen nothing worrying
  kindWords: "Use words that are kind and OK for school.",

  // For sentences the rule checks find personal details in, or that are
  // mostly not in English (tasks/scribbles-worker-spec.md, step 3)
  privateDetails: "Leave out private things like full names, addresses and phone numbers.",
  inEnglish: "Write your sentence in English so everyone in class can read it.",

  // For a sentence that's ready
  great: "Great picture! Keep painting with words.",
} as const;

export type TipId = keyof typeof TIPS;

export const TIP_IDS = Object.keys(TIPS) as [TipId, ...TipId[]];

// The tip that goes with "approve"; every other tip goes with "redo"
export const PRAISE: TipId = "great";

// Clean-up tips: the writing itself (spelling, capitals, punctuation,
// grammar). Every other tip asks the child to revise (stay on topic, use
// their own words, add a detail, kinder words...), and revising comes
// first: a child shouldn't fix every spelling mistake only to find the
// sentence has to be written again.
export const CLEAN_UP_TIPS: ReadonlySet<TipId> = new Set<TipId>([
  "spelling",
  "capitals",
  "endMark",
  "punctuation",
  "checkWriting",
  "readAloud",
]);

// The one tip to send back, given a model's tip and the writing checks' tip
// (either may be missing). A revise tip goes first. Two different clean-up
// tips become one that covers both, so they're fixed in one try.
export const firstTip = (modelTip: TipId | null, writingTip: TipId | null): TipId | null => {
  if (modelTip && !CLEAN_UP_TIPS.has(modelTip)) return modelTip;
  if (!modelTip || !writingTip || modelTip === writingTip) return writingTip ?? modelTip;
  return "checkWriting";
};
