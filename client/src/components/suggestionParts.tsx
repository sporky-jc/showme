import type { ReactElement } from "react";
import type { ScribblesSuggestion } from "../api/types";
import { NoteBody } from "./NoteBody";
import Trail from "./SuggestionTrail";

// The parts under each Teacher page card (spec/SPEC-teacher-suggestions.md):
// one list decides which show and in what order, so a part is added or
// removed by changing one line. Each part shows only when it has something
// to say, and reads nothing but the suggestion.

export interface SuggestionPart {
  id: string;
  show: (suggestion: ScribblesSuggestion) => boolean;
  Part: (props: { suggestion: ScribblesSuggestion; firstName: string }) => ReactElement;
}

// What Scribbles would do: his note, with its sticker and tip
const outcome: SuggestionPart = {
  id: "outcome",
  show: (s) => !s.waiting,
  Part: NoteBody,
};

// He'd approve it or send it back, and wants the teacher to know why
const teacherNote: SuggestionPart = {
  id: "teacher-note",
  show: (s) => !s.waiting && s.teacher !== undefined,
  Part: ({ suggestion }) => {
    const would = suggestion.verdict === "approve" ? "approve it" : "send it back";
    const worried = suggestion.trail?.some((step) => step.said === "worried");
    const why =
      suggestion.teacher === "worry"
        ? "It may be unkind about someone, or try to trick me."
        : worried
          ? "My helpers were worried at first, then agreed it's play or a story."
          : "My helpers didn't agree on it.";
    return (
      <p className="paper-scribbles-fyi">
        <span className="paper-scribbles-fyi__sticker">FYI</span> I&apos;d {would}, and I wanted you to know. {why}
      </p>
    );
  },
};

// Still being read: no note yet
const waiting: SuggestionPart = {
  id: "waiting",
  show: (s) => s.waiting === true,
  Part: () => <p className="paper-scribbles-waiting">Still reading this one.</p>,
};

const trail: SuggestionPart = {
  id: "trail",
  show: (s) => (s.trail?.length ?? 0) > 0,
  Part: Trail,
};

export const SUGGESTION_PARTS: SuggestionPart[] = [outcome, teacherNote, waiting, trail];
