import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Cards from "../components/Cards";
import Scribbles from "../components/Scribbles";
import GalleryPick from "../components/GalleryPick";
import SenseFinder from "../components/SenseFinder";
import { DisplayCollectionSentences } from "../config";
import { senseWords } from "../senses";
import type { SenseKey } from "../senses";
import { anyOf, pickAndWall } from "./pickAndWall";
import { useLikes } from "../components/useLikes";
import { useOpenLogin } from "../components/loginPopup";
import LoadingOverlay from "react-loading-overlay-ts";
import { fetchApprovedSentences } from "../actions/approvedsentences";
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
  // Scribbles' pick, once "Show me another" has chosen one (see pickAndWall)
  const [pickId, setPickId] = useState<string | null>(null);
  // The sense finder's sense, if one is pressed (see SenseFinder)
  const [sense, setSense] = useState<SenseKey | null>(null);
  // How many of the wall's cards are showing; Show more adds
  // DisplayCollectionSentences, and a new order or sense starts again
  const [limit, setLimit] = useState(DisplayCollectionSentences);
  // The card the keyboard goes to after Show more
  const focusAt = useRef<number | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const openLogin = useOpenLogin();
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
    setPickId(null);
    setLimit(DisplayCollectionSentences);
  };
  const showNewest = () => {
    setDisplay(sentences);
    setOrder("newest");
    setPickId(null);
    setLimit(DisplayCollectionSentences);
  };
  const pickSense = (next: SenseKey | null) => {
    setSense(next);
    setLimit(DisplayCollectionSentences);
  };
  const showMore = () => {
    focusAt.current = limit;
    setLimit(limit + DisplayCollectionSentences);
  };
  // After Show more, the keyboard (and a screen reader) goes to the first new card
  useEffect(() => {
    if (focusAt.current === null) return;
    page.current?.querySelectorAll<HTMLElement>(".paper-gallery__card")[focusAt.current]?.focus();
    focusAt.current = null;
  }, [limit]);

  const { pick, wall, others } = pickAndWall(displaySentences, pickId);
  // With a sense pressed, the wall shows every sentence but the pick that
  // uses it (Cards shows the first DisplayCollectionSentences of them)
  const found = sense
    ? displaySentences.filter((sentence) => sentence !== pick && senseWords(sentence.show)[sense] !== null)
    : wall;
  // A different one from the ones Scribbles could pick
  const showAnother = () => {
    const choices = others.filter((sentence) => sentence._id !== pick?._id);
    setPickId(anyOf(choices)._id);
  };

  // Scribbles taped the cards up. He tells a signed-in student when one of
  // theirs is among the ones showing.
  const firstName = useSelector((state: RootState) => state.user.firstName);
  const showing = found.slice(0, limit);
  const mineIsUp = (pick ? [pick, ...showing] : showing)
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
        <div className="paper-gallery" ref={page}>
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
          {pick && (
            <GalleryPick
              sentence={pick}
              signedIn={userId !== undefined}
              onAnother={others.length > 1 ? showAnother : undefined}
              likes={likes}
              onToggleLike={toggle}
            />
          )}
          {sentences.length > 0 && <SenseFinder sense={sense} found={found.length} onPick={pickSense} />}
          {!loading && sentences.length === 0 ? (
            <p className="page-message">
              No sentences have been approved yet.
            </p>
          ) : (
            <Cards
              displaySentences={found}
              likes={likes}
              onToggleLike={toggle}
              limit={limit}
            />
          )}
          {found.length > DisplayCollectionSentences && (
            <div className="paper-gallery__more">
              <p role="status">
                {found.length > limit
                  ? `Showing ${limit} of ${found.length} sentences.`
                  : `Showing all ${found.length} sentences.`}
              </p>
              {found.length > limit && (
                <button type="button" className="paper-btn paper-btn--action" onClick={showMore}>
                  Show more
                </button>
              )}
            </div>
          )}
          {/* Scribbles' invite, for visitors: the button opens the sign-in
              pop-up, but isn't called Sign in, so it's never mistaken for
              the menu's Sign in button */}
          {userId === undefined && sentences.length > 0 && (
            <section className="paper-invite" aria-labelledby="paper-invite">
              <Scribbles mood="idle" size={100} decorative />
              <div className="paper-invite__words">
                <h2 id="paper-invite">I tape up the best ones</h2>
                <p>Sign in with your school account, show me a Tell, and yours could hang here next.</p>
              </div>
              <button type="button" className="paper-btn paper-btn--action" onClick={openLogin}>
                Write one too
              </button>
            </section>
          )}
        </div>
      )}
    </LoadingOverlay>
  );
}

export default React.memo(Collection);
