import type { GallerySentence } from "../api/types";
import { SENSE_NAMES } from "../senses";
import type { SenseKey } from "../senses";

// For the gallery's cards and its sense finder: how an author is named,
// and the classes that light up a sense word or draw a sense's dot.

// First name and last initial. The server sends only the initial as lastName
// (see GalleryAuthor in the contract), but older servers sent the whole
// surname, so this still takes its first letter either way. Some accounts
// have no last name (the database doesn't require one).
export const authorName = ({ firstName, lastName }: GallerySentence["author"]) =>
  lastName ? `${firstName} ${Array.from(lastName)[0]}.` : firstName;

// Each sense's classes, written out whole so the build keeps their styles
// (it keeps only class names it finds in the code)
export const LIT: Record<SenseKey, string> = {
  see: "paper-gallery__sense paper-gallery__sense--see",
  hear: "paper-gallery__sense paper-gallery__sense--hear",
  feel: "paper-gallery__sense paper-gallery__sense--feel",
  smell: "paper-gallery__sense paper-gallery__sense--smell",
  taste: "paper-gallery__sense paper-gallery__sense--taste",
};

export const DOT: Record<SenseKey, string> = {
  see: "paper-gallery__dot paper-gallery__dot--see",
  hear: "paper-gallery__dot paper-gallery__dot--hear",
  feel: "paper-gallery__dot paper-gallery__dot--feel",
  smell: "paper-gallery__dot paper-gallery__dot--smell",
  taste: "paper-gallery__dot paper-gallery__dot--taste",
};

// "Uses hear and feel", "Uses see, feel and taste"
const listOf = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export const usesLabel = (senses: SenseKey[]) =>
  `Uses ${listOf(senses.map((sense) => SENSE_NAMES[sense].toLowerCase()))}`;
