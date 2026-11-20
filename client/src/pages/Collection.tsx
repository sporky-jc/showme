import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Cards from "../components/Cards";
import Scribbles from "../components/Scribbles";
import { useLikes } from "../components/useLikes";
import LoadingOverlay from "react-loading-overlay-ts";
import { fetchApprovedSentences } from "../actions/approvedsentences";
import { DisplayCollectionSentences } from "../config";
import type { GallerySentence } from "../api/types";
import type { AppDispatch, RootState } from "../reducers/types";

// A copy of the list in a random order
const shuffle = (sentences: GallerySentence[]) =>
  [...sentences]
    .map((sentence) => ({ sentence, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ sentence }) => sentence);

function Collection() {
  const dispatch = useDispatch<AppDispatch>();

  // The server's list (newest first), the order chosen for display (random by
  // default), whether we're still waiting for the server, and whether the
  // last request failed. Bumping `attempt` asks the server again.
  const [sentences, setSentences] = useState<GallerySentence[]>([]);
  const [displaySentences, setDisplay] = useState<GallerySentence[]>([]);
  const [order, setOrder] = useState<"shuffle" | "newest">("shuffle");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Likes, for signed-in users only: with nobody signed in, `likes` is null
  // and the cards show none. They follow whoever is signed in, so logging
  // out hides them at once. Try again asks for them again too.
  const userId = useSelector((state: RootState) => state.user.id);
  const { likes, toggle } = useLikes(userId, attempt);

  // Ask the server for the approved sentences, and shuffle them as soon as
  // they arrive. Only the server's answer is ever shown: an old list the
  // browser may have remembered never is, not even by the order buttons.
  useEffect(() => {
    let stillHere = true;
    dispatch(fetchApprovedSentences()).then((fresh) => {
      if (!stillHere) return; // the visitor already left this page
      if (fresh) {
        setSentences(fresh);
        setDisplay(shuffle(fresh));
        setOrder("shuffle");
      } else {
        setFailed(true);
      }
      setLoading(false);
    });
    return () => {
      stillHere = false;
    };
  }, [dispatch, attempt]);

  // After a failed request: show the loader again and ask once more
  const tryAgain = () => {
    setFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  // The two orders. Shuffle again deals the cards afresh.
  const showShuffled = () => {
    setDisplay(shuffle(sentences));
    setOrder("shuffle");
  };
  const showNewest = () => {
    setDisplay(sentences);
    setOrder("newest");
  };

  // Scribbles taped the cards up. He tells a signed-in student when one of
  // theirs is among the ones showing.
  const firstName = useSelector((state: RootState) => state.user.firstName);
  const mineIsUp = displaySentences
    .slice(0, DisplayCollectionSentences)
    .some((sentence) => likes?.[sentence._id]?.mine);

  // The Show ME gallery: every approved sentence, from every student
  return (
    <LoadingOverlay
      active={loading}
      spinner
      text="Loading..."
      className="contentcollection"
    >
      {failed ? (
        <div className="page-message" role="alert">
          <p>
            We couldn&apos;t load the gallery. Check your internet
            connection, then try again.
          </p>
          <button type="button" className="paper-btn paper-btn--action" onClick={tryAgain}>
            Try again
          </button>
        </div>
      ) : (
        <div className="paper-gallery">
          <div className="paper-gallery__top">
            <div className="paper-gallery__title">
              <h1>Show ME gallery</h1>
              <Scribbles prop="tape" size={80} decorative />
              <p className="paper-bubble">
                {mineIsUp ? `I taped yours up, ${firstName}!` : "Look what everyone made!"}
              </p>
            </div>
            <div className="paper-toggle paper-gallery__order" role="group" aria-label="Order">
              <button type="button" aria-pressed={order === "shuffle"} onClick={showShuffled}>
                Shuffle
              </button>
              <button type="button" aria-pressed={order === "newest"} onClick={showNewest}>
                Newest
              </button>
            </div>
          </div>
          {!loading && sentences.length === 0 ? (
            <p className="page-message">
              No sentences have been approved yet.
            </p>
          ) : (
            <Cards
              displaySentences={displaySentences}
              likes={likes}
              onToggleLike={toggle}
            />
          )}
        </div>
      )}
    </LoadingOverlay>
  );
}

export default React.memo(Collection);
