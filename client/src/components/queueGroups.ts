import type { ScribblesSuggestion } from "../api/types";
import { noteKind } from "./noteKind";

// How much each waiting sentence needs the teacher (spec/
// SPEC-teacher-suggestions.md, "Groups"): the Teacher page sorts and
// filters by these, and counts them at the top. One list: a group can be
// added, removed or moved by changing it. Each card goes in the first group
// that has it; one whose group was removed goes in "routine".

export type GroupId = "needs-you" | "your-call" | "fyi" | "routine" | "reading";

export interface QueueGroup {
  id: GroupId;
  // Its name on the page
  label: string;
  has: (suggestion: ScribblesSuggestion | undefined) => boolean;
}

const worrying = (s: ScribblesSuggestion | undefined) => s?.reasons.includes("worrying") === true;
const reading = (s: ScribblesSuggestion | undefined) => s?.waiting === true && !worrying(s);
const decided = (s: ScribblesSuggestion | undefined): s is ScribblesSuggestion => s !== undefined && !worrying(s) && !reading(s);

const needsYou: QueueGroup = { id: "needs-you", label: "Needs you now", has: worrying };
// Scribbles couldn't decide, the rules held it, or he hasn't read it at all
const yourCall: QueueGroup = {
  id: "your-call",
  label: "Your call",
  has: (s) => s === undefined || (decided(s) && !s.teacher && ["held", "your-call"].includes(noteKind(s))),
};
// He'd approve it or send it back, and wants the teacher to know
const fyi: QueueGroup = { id: "fyi", label: "FYI", has: (s) => decided(s) && s.teacher !== undefined };
const routine: QueueGroup = {
  id: "routine",
  label: "Routine",
  has: (s) => decided(s) && !s.teacher && ["ready", "again"].includes(noteKind(s)),
};
const stillReading: QueueGroup = { id: "reading", label: "Still reading", has: reading };

export const QUEUE_GROUPS: QueueGroup[] = [needsYou, yourCall, fyi, routine, stillReading];

export const groupOf = (suggestion: ScribblesSuggestion | undefined, groups = QUEUE_GROUPS): GroupId =>
  groups.find((group) => group.has(suggestion))?.id ?? "routine";

// Where a group comes in the queue: its place in the list (one that was
// removed, with "routine")
export const groupPlace = (id: GroupId, groups = QUEUE_GROUPS) => {
  const at = groups.findIndex((group) => group.id === id);
  return at === -1 ? groups.findIndex((group) => group.id === "routine") : at;
};
