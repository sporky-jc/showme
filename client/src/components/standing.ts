import type { Sentence } from "../api/types";

// Where a sentence stands, in the student's words, and the paper note's
// color for it. The class names are written out in full: the build only
// keeps styles for names it finds in the code as written (see
// vite.config.ts).
export const standing = (sentence: Pick<Sentence, "approved" | "toRedo">) =>
  sentence.approved
    ? { note: "paper-note paper-note--done", label: "Done · in the gallery" }
    : sentence.toRedo
    ? { note: "paper-note paper-note--retry", label: "Try again" }
    : { note: "paper-note paper-note--wait", label: "Scribbles is checking…" };
