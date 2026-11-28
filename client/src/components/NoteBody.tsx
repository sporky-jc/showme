import React from "react";
import Scribbles from "./Scribbles";
import type { ScribblesMood, ScribblesProp } from "./Scribbles";
import type { ScribblesSuggestion } from "../api/types";
import { CHECK_IN, HELD, noteKind } from "./noteKind";
import type { NoteKind } from "./noteKind";

// What Scribbles would do with a sentence, said in his voice next to him:
// the first part of his note on a Teacher page card (suggestionParts.tsx).

// The kinds of note, each with its look. Written out in full: the production
// build keeps only CSS class names that appear literally in the code
// (vite.config.ts).
const NOTE = {
  "check-in": { className: "paper-scribbles-note paper-scribbles-note--check-in", sticker: "Check in", mood: "worried", prop: "none" },
  held: { className: "paper-scribbles-note paper-scribbles-note--check-in", sticker: "Please read", mood: "idle", prop: "note" },
  ready: { className: "paper-scribbles-note paper-scribbles-note--ready", sticker: "Ready!", mood: "happy", prop: "check" },
  again: { className: "paper-scribbles-note paper-scribbles-note--again", sticker: "Try again", mood: "thinking", prop: "note" },
  "your-call": { className: "paper-scribbles-note paper-scribbles-note--your-call", sticker: "Your call", mood: "idle", prop: "none" },
} as const satisfies Record<NoteKind, { className: string; sticker: string; mood: ScribblesMood; prop: ScribblesProp }>;

// What each capitals or punctuation mistake is, said simply
const MECHANIC = {
  "capital-start": "a capital at the start",
  "lowercase-i": "\"I\" as a capital",
  "end-mark": "an end mark",
  "space-before-mark": "spaces around punctuation",
  "no-space-after-mark": "spaces around punctuation",
  "repeated-word": "a repeated word",
  "a-an": "\"a\" or \"an\"",
} as const;

const quoted = (text: string) => `“${text}”`;

export function NoteBody({ suggestion, firstName }: { suggestion: ScribblesSuggestion; firstName: string }) {
  const kind = noteKind(suggestion);
  const look = NOTE[kind];
  const heldFor = suggestion.reasons.find((reason): reason is keyof typeof HELD => reason in HELD);
  const checkInFor = suggestion.reasons.find((reason): reason is keyof typeof CHECK_IN => reason in CHECK_IN);
  const toFix = [
    ...new Set((suggestion.mechanics ?? []).map((issue) => MECHANIC[issue.kind])),
  ];

  let title: string;
  let said: string;
  switch (kind) {
    case "check-in":
      title = `${firstName} may need help.`;
      // Held by the welfare check, an AI read it; held by the rules, none did
      said = checkInFor
        ? `${CHECK_IN[checkInFor]} so I held it just for you. Please read it and check in with ${firstName}.`
        : `This sounds worrying, so I held it just for you. Please read it and check in with ${firstName}. No AI saw it.`;
      break;
    case "held":
      title = "Please read this one.";
      said = `${heldFor ? HELD[heldFor] : "It needs a grown-up's eyes,"} so I held it for you. No AI saw it.`;
      break;
    case "ready":
      title = "Ready for the gallery.";
      said = `${firstName} will see: ${quoted(suggestion.tip?.text ?? "")}`;
      break;
    case "again":
      title = suggestion.misspelled?.length
        ? `Words to fix: ${suggestion.misspelled.join(", ")}.`
        : toFix.length
          ? `Check ${toFix.join(" and ")}.`
          : "Not quite there yet.";
      said = suggestion.tip ? `My tip: ${quoted(suggestion.tip.text)}` : "Press Try again to pick a tip.";
      break;
    default:
      // Already sent back twice: Scribbles never suggests a third "Try
      // again" (MAX_SEND_BACKS, backend/reviewer/sendBacks.ts), so the
      // teacher knows why it's theirs to decide
      if (suggestion.reasons.includes("redo-limit")) {
        title = "Sent back twice already.";
        said = `So I'll leave this one to you. You know ${firstName} best.`;
        break;
      }
      title = "Hmm, I'm not sure about this one.";
      said = `You know ${firstName} best. Over to you!`;
  }

  return (
    <div className="paper-scribbles-note__row">
      <Scribbles mood={look.mood} prop={look.prop} size={64} decorative />
      <div className={look.className} role="note">
        <span className="paper-scribbles-note__sticker">{look.sticker}</span>
        <p className="paper-scribbles-note__title">
          <span className="visually-hidden">Scribbles: </span>
          {title}
        </p>
        <p className="paper-scribbles-note__said">{said}</p>
      </div>
    </div>
  );
}

