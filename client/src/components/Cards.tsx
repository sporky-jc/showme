import React from "react";
import { useSelector } from "react-redux";
import * as config from "../../src/config";
import LikeButton from "./LikeButton";
import type { LikesById } from "./useLikes";
import type { GallerySentence } from "../api/types";
import type { RootState } from "../reducers/types";
import { frameStyle } from "../frames";

// Nothing to do when there are no likes to press
const noLikes = () => {};

// First name and last initial. The server sends only the initial as lastName
// (see GalleryAuthor in the contract), but older servers sent the whole
// surname, so this still takes its first letter either way. Some accounts
// have no last name (the database doesn't require one).
const authorName = ({ firstName, lastName }: GallerySentence["author"]) =>
  lastName ? `${firstName} ${Array.from(lastName)[0]}.` : firstName;

// The gallery's cards: each approved sentence under its Tell sentence's
// photo, with who wrote it and, for signed-in users, its likes.
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
        const day = Number(sentence.title.match(/\d+$/)?.[0]);
        return (
          <li key={sentence._id}>
            <article className="paper-gallery__card">
              {/* Scenery for the sentences under it, which say it all, in
                  the frame its author picked (see frames.ts). The sky shows
                  in it until it has downloaded. */}
              <div className="paper-gallery__frame" style={frameStyle(sentence.look?.frame)}>
                <div className="paper-gallery__window">
                  <img
                    className="paper-gallery__photo"
                    src={tellSentences[day - 1]?.image}
                    alt=""
                    loading="lazy"
                  />
                </div>
              </div>
              <p className="paper-gallery__tell">{sentence.tell}</p>
              <p className="paper-gallery__show">{sentence.show}</p>
              <div className="paper-gallery__foot">
                <span className="paper-gallery__author">{authorName(sentence.author)}</span>
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
