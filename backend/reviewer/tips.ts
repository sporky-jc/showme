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

  // For a sentence that's ready
  great: "Great picture! Keep painting with words.",
} as const;

export type TipId = keyof typeof TIPS;

export const TIP_IDS = Object.keys(TIPS) as [TipId, ...TipId[]];

// The tip that goes with "approve"; every other tip goes with "redo"
export const PRAISE: TipId = "great";
