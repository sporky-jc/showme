import React from "react";
import { useSelector } from "react-redux";
import * as config from "../../src/config";
import LikeButton from "./LikeButton";
import type { LikesById } from "./useLikes";
import type { GallerySentence } from "../api/types";
import type { RootState } from "../reducers/types";
import { frameStyle } from "../frames";
import { tellById, withoutAsk } from "../tells";
import { SENSE_KEYS, SENSE_NAMES, sensePieces } from "../senses";
import type { SenseKey } from "../senses";

// Each sense's classes, written out whole so the build keeps their styles
// (it keeps only class names it finds in the code)
const LIT: Record<SenseKey, string> = {
  see: "paper-gallery__sense paper-gallery__sense--see",
  hear: "paper-gallery__sense paper-gallery__sense--hear",
  feel: "paper-gallery__sense paper-gallery__sense--feel",
  smell: "paper-gallery__sense paper-gallery__sense--smell",
  taste: "paper-gallery__sense paper-gallery__sense--taste",
};
const DOT: Record<SenseKey, string> = {
  see: "paper-gallery__dot paper-gallery__dot--see",
  hear: "paper-gallery__dot paper-gallery__dot--hear",
  feel: "paper-gallery__dot paper-gallery__dot--feel",
  smell: "paper-gallery__dot paper-gallery__dot--smell",
  taste: "paper-gallery__dot paper-gallery__dot--taste",
};

// Nothing to do when there are no likes to press
const noLikes = () => {};

// First name and last initial. The server sends only the initial as lastName
// (see GalleryAuthor in the contract), but older servers sent the whole
// surname, so this still takes its first letter either way. Some accounts
// have no last name (the database doesn't require one).
const authorName = ({ firstName, lastName }: GallerySentence["author"]) =>
  lastName ? `${firstName} ${Array.from(lastName)[0]}.` : firstName;

// "hear and feel", "see, feel and taste"
const listOf = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// The gallery's cards: each approved sentence, the star of its card, with
// its words that use a sense lit up in that sense's color (see senses.ts),
// under its crossed-out Tell and that Tell's photo, in the frame its author
// picked. Then who wrote it, the senses it uses and, for signed-in users,
// its likes.
function Cards(props: {
  displaySentences?: GallerySentence[];
  // The signed-in user's view of each sentence's likes, or null for none
  likes?: LikesById | null;
  onToggleLike?: (id: string) => void;
}) {
  const tellSentences = useSelector((state: RootState) => state.tellsentences);
  const likes = props.likes ?? null;
  const onToggleLike = props.onToggleLike ?? noLikes;
  const sentences = (props.displaySentences ?? []).slice(
    0,
    config.DisplayCollectionSentences
  );

  return (
    <ul className="paper-gallery__cards">
      {sentences.map((sentence) => {
        const pieces = sensePieces(sentence.show);
        const senses = SENSE_KEYS.filter((sense) => pieces.some((piece) => piece.sense === sense));
        return (
          <li key={sentence._id}>
            <article className="paper-gallery__card" style={frameStyle(sentence.look?.frame)}>
              {/* Scenery for the sentences under it, which say it all. The
                  sky shows in it until it has downloaded. */}
              <div className="paper-gallery__frame">
                <div className="paper-gallery__window">
                  <img
                    className="paper-gallery__photo"
                    src={tellById(tellSentences, sentence.title)?.image}
                    alt=""
                    loading="lazy"
                  />
                </div>
              </div>
              {/* Its text stays exactly the Tell: QA Wolf flows read it */}
              <p className="paper-gallery__tell">{withoutAsk(sentence.tell)}</p>
              <p className="paper-gallery__show">
                {pieces.map((piece, place) =>
                  piece.sense ? (
                    <mark key={place} className={LIT[piece.sense]}>
                      {piece.text}
                    </mark>
                  ) : (
                    piece.text
                  )
                )}
              </p>
              <div className="paper-gallery__foot">
                <span className="paper-gallery__author">{authorName(sentence.author)}</span>
                {senses.length > 0 && (
                  <span
                    className="paper-gallery__senses"
                    role="img"
                    aria-label={`Uses ${listOf(senses.map((sense) => SENSE_NAMES[sense].toLowerCase()))}`}
                  >
                    {senses.map((sense) => (
                      <span key={sense} className={DOT[sense]} />
                    ))}
                  </span>
                )}
                {/* Signed-in users only: with nobody signed in there are
                    no likes to show (see useLikes) */}
                {likes?.[sentence._id] && (
                  <LikeButton
                    likes={likes[sentence._id]}
                    onToggle={() => onToggleLike(sentence._id)}
                  />
                )}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

export default React.memo(Cards);
