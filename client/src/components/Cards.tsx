import React from "react";
import { useSelector } from "react-redux";
import * as config from "../../src/config";
import LikeButton from "./LikeButton";
import type { LikesById } from "./useLikes";
import type { GallerySentence } from "../api/types";
import type { RootState } from "../reducers/types";
import { frameStyle } from "../frames";
import { tellById, withoutAsk } from "../tells";
import { SENSE_KEYS, sensePieces } from "../senses";
import { DOT, LIT, authorName, usesLabel } from "./galleryWords";
import { useFeature } from "../features";

// Nothing to do when there are no likes to press
const noLikes = () => {};

// The gallery's cards: each approved sentence, the star of its card, under
// its crossed-out Tell and that Tell's photo, in the frame its author
// picked. Then who wrote it and, for signed-in users, its likes.
//
// With the senseHighlights feature on (see features.ts), its words that use
// a sense are lit up in that sense's color (see senses.ts), and a row of
// dots says which senses it uses. Without it, the sentence is plain.
function Cards(props: {
  displaySentences?: GallerySentence[];
  // The signed-in user's view of each sentence's likes, or null for none
  likes?: LikesById | null;
  onToggleLike?: (id: string) => void;
  // How many to show (Show more raises it)
  limit?: number;
}) {
  const tellSentences = useSelector((state: RootState) => state.tellsentences);
  const lit = useFeature("senseHighlights");
  const likes = props.likes ?? null;
  const onToggleLike = props.onToggleLike ?? noLikes;
  const sentences = (props.displaySentences ?? []).slice(0, props.limit ?? config.DisplayCollectionSentences);

  return (
    <ul className="paper-gallery__cards">
      {sentences.map((sentence) => {
        const pieces = lit ? sensePieces(sentence.show, sentence.senseTags) : [{ text: sentence.show, sense: null }];
        const senses = SENSE_KEYS.filter((sense) => pieces.some((piece) => piece.sense === sense));
        return (
          <li key={sentence._id}>
            {/* tabIndex -1: Show more puts the keyboard on the first new one */}
            <article className="paper-gallery__card" style={frameStyle(sentence.look?.frame)} tabIndex={-1}>
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
                    aria-label={usesLabel(senses)}
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
