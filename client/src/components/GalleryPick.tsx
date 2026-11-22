import React from "react";
import { Link } from "react-router";
import { useSelector } from "react-redux";
import Scribbles from "./Scribbles";
import LikeButton from "./LikeButton";
import type { LikesById } from "./useLikes";
import { frameStyle } from "../frames";
import { tellById, withoutAsk } from "../tells";
import { SENSE_KEYS, SENSE_NAMES, sensePieces } from "../senses";
import { DOT, LIT, authorName } from "./galleryWords";
import type { GallerySentence } from "../api/types";
import type { RootState } from "../reducers/types";

// Scribbles' pick: one approved sentence, big, at the top of the gallery, so
// a visitor sees at once what Show ME is about. Its Tell is crossed out, then
// the sentence that shows it writes itself in, with its sense words lit up
// (the page's one big moment; it stands still under reduced motion), next
// to the Tell's photo in the frame its author picked. "Show me another"
// asks the gallery for a different one. Visitors who aren't signed in are
// invited to try one themselves; signed-in users can like it, as on a card.
//
// Its classes are its own (paper-pick__…), not the cards' (paper-gallery__…):
// QA Wolf's flows find the gallery's cards by those.
function GalleryPick({
  sentence,
  signedIn,
  onAnother,
  likes = null,
  onToggleLike,
}: {
  sentence: GallerySentence;
  signedIn: boolean;
  // The signed-in user's view of each sentence's likes, or null for none
  likes?: LikesById | null;
  onToggleLike?: (id: string) => void;
  // How to show a different one, if there is one
  onAnother?: () => void;
}) {
  const tellSentences = useSelector((state: RootState) => state.tellsentences);
  const pieces = sensePieces(sentence.show, sentence.senseTags);
  // Each sense the sentence uses, with its words: "Hear: crunched"
  const senses = SENSE_KEYS.flatMap((sense) => {
    const words = [
      ...new Set(pieces.filter((piece) => piece.sense === sense).map((piece) => piece.text.toLowerCase())),
    ];
    return words.length > 0 ? [{ sense, words }] : [];
  });
  const name = authorName(sentence.author);

  return (
    <section className="paper-pick" aria-label="Scribbles’ pick">
      <article className="paper-pick__words">
        {/* Keyed by the sentence, so each new one plays the moment again */}
        <p key={`tell-${sentence._id}`} className="paper-pick__tell">
          <span className="paper-pick__strike">{withoutAsk(sentence.tell)}</span>
        </p>
        <p key={`show-${sentence._id}`} className="paper-pick__show">
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
        <div className="paper-pick__by">
          <p className="paper-pick__author">{name} showed it.</p>
          {likes?.[sentence._id] && onToggleLike && (
            <LikeButton likes={likes[sentence._id]} onToggle={() => onToggleLike(sentence._id)} />
          )}
        </div>
        {senses.length > 0 && (
          <ul className="paper-pick__senses" aria-label="Senses in this sentence">
            {senses.map(({ sense, words }) => (
              <li key={sense}>
                <span className={DOT[sense]} aria-hidden />
                {`${SENSE_NAMES[sense]}: ${words.join(", ")}`}
              </li>
            ))}
          </ul>
        )}
        <div className="paper-pick__actions">
          {onAnother && (
            <button type="button" className="paper-btn paper-btn--action" onClick={onAnother}>
              Show me another
            </button>
          )}
          {!signedIn && (
            <Link to="/about" className="paper-pick__try">
              Try one yourself
            </Link>
          )}
        </div>
        {/* Says who wrote the new one, for screen readers, after Show me another */}
        <p className="visually-hidden" role="status">
          {`Scribbles’ pick: ${name}’s sentence.`}
        </p>
      </article>

      <div className="paper-pick__picture">
        <div className="paper-pick__frame" style={frameStyle(sentence.look?.frame)}>
          <img src={tellById(tellSentences, sentence.title)?.image} alt="" />
        </div>
        <div className="paper-pick__scribbles">
          <Scribbles mood="happy" size={130} decorative />
          <p className="paper-bubble">Tell says it. Show lets you see it!</p>
        </div>
      </div>
    </section>
  );
}

export default GalleryPick;
