import type { Technique, TellSentence } from "./api/types";

// Finding a Tell, and saying what it asks for (see tasks/plan.md).
//
// A student's sentence names its Tell by id: its title ("day7"). Tells are
// found by that id, never by their place in the list, so new Tells and paths
// can't move an old sentence's Tell or photo.

// The Tell with this id, if the list has it
export const tellById = (tells: readonly TellSentence[], id: string | undefined) =>
  id === undefined ? undefined : tells.find((tell) => tell.id === id);

// The id of a day's Tell on the Classic path
export const classicId = (day: number) => `day${day}`;

// Whether a Tell list can be looked up by id. A browser may still hold a list
// saved before Tells had ids: that one has to be fetched again.
export const hasIds = (tells: readonly Partial<TellSentence>[]) =>
  tells.length > 0 && tells.every((tell) => typeof tell.id === "string");

// Classic's later Tells name their ask in their words: "(Use a Simile)". The
// stored words keep it (the reviewer reads it), but on screen the badge says
// it instead, so it's taken off here.
const ASK = /\s*\(\s*use\s+(?:an?\s+)?[a-z]+\s*\)\s*$/i;
export const withoutAsk = (tell: string) => tell.replace(ASK, "");

// What the badge says a Tell asks for. Every Tell asks for the senses, so
// those get no badge.
const ASKS: Record<Exclude<Technique, "senses">, string> = {
  simile: "a simile",
  metaphor: "a metaphor",
  personification: "personification",
  onomatopoeia: "a sound word",
  hyperbole: "hyperbole",
  alliteration: "alliteration",
  allusion: "an allusion",
};

export const askOf = (technique: Technique | undefined) =>
  technique && technique !== "senses" ? `This Tell asks for ${ASKS[technique]}` : null;

// Today's hint for writing the Tell: the senses, or what the Tell asks for
export const hintFor = (technique: Technique | undefined) =>
  technique && technique !== "senses"
    ? `Show it with ${ASKS[technique]}.`
    : "Show it with what you see, hear and feel.";
