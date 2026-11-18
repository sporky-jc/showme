import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import { useDispatch, useSelector, useStore } from "react-redux";
import Scribbles from "../components/Scribbles";
import PageLoading from "../components/PageLoading";
import { getTellSentences } from "../actions/tellsentences";
import { getUserSentences } from "../actions/usersentences";
import type { Sentence } from "../api/types";
import type { AppDispatch, RootState } from "../reducers/types";

// How many of the student's latest sentences to show under today's Tell
const LATEST = 3;

// Where a sentence stands, in the student's words. The class names are
// written out in full: the build only keeps styles for names it finds in the
// code as written (see vite.config.ts).
const standing = (sentence: Sentence) =>
  sentence.approved
    ? { note: "paper-note paper-note--done", label: "Done · in Collections" }
    : sentence.toRedo
    ? { note: "paper-note paper-note--retry", label: "Try again" }
    : { note: "paper-note paper-note--wait", label: "Waiting to be checked" };

// A signed-in student's home: today's Tell sentence with the way to start
// writing, and where their latest sentences stand.
function Today() {
  const user = useSelector((state: RootState) => state.user);
  const tellSentences = useSelector((state: RootState) => state.tellsentences);
  const userSentences = useSelector((state: RootState) => state.usersentences);
  const dispatch = useDispatch<AppDispatch>();

  const store = useStore<RootState>();

  // Today's Tell is the one after the student's last sentence, so it's only
  // known once their list has arrived, and the Tell sentences too (the app
  // asks for those when it opens; ask again if they still aren't here).
  // Without both, say so: a guess would show the wrong day, or "all done".
  const [loaded, setLoaded] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    (async () => {
      const mine = await dispatch(getUserSentences());
      const tells =
        store.getState().tellsentences.length > 0 || (await dispatch(getTellSentences()));
      if (current) setLoaded(mine && tells ? "ready" : "failed");
    })();
    return () => {
      current = false;
    };
  }, [dispatch, store, attempt]);

  if (loaded === "loading") return <PageLoading />;
  if (loaded === "failed") {
    return (
      <div className="paper-today">
        <div className="page-message" role="alert">
          <p>
            We couldn&apos;t load today&apos;s sentence. Check your internet
            connection, then try again.
          </p>
          <button
            type="button"
            className="paper-btn paper-btn--action"
            onClick={() => {
              setLoaded("loading");
              setAttempt(attempt + 1);
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const today = tellSentences[userSentences.length];
  const shown = userSentences.filter((sentence) => sentence.approved).length;
  // Newest first; each keeps its place in the list, which is its day
  const latest = userSentences
    .map((sentence, index) => ({ sentence, tell: tellSentences[index]?.tell }))
    .reverse()
    .slice(0, LATEST);

  return (
    <div className="paper-today">
      <div className="paper-today__hello">
        <h1>Hi {user.firstName}!</h1>
        {shown > 0 && (
          <span className="paper-status paper-status--done">
            {shown} {shown === 1 ? "sentence" : "sentences"} shown
          </span>
        )}
      </div>

      <div className="paper-stack">
        {today ? (
          <div className="paper-stack__card paper-today__card">
            <div className="paper-today__tell">
              <span className="paper-status paper-status--retry">Today's Tell</span>
              <p className="paper-today__sentence">“{today.tell}”</p>
              <p className="paper-today__hint">
                Show it with what you see, hear and feel.
              </p>
              <Link to="/MyPage" className="paper-btn paper-btn--action paper-today__start">
                Start showing
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 20l1.2-4.6L16.5 4.1a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" />
                  <path d="M14.5 6l3.5 3.5" />
                </svg>
              </Link>
            </div>
            {/* Scenery for the sentence beside it, which says it all */}
            <img className="paper-today__photo" src={today.image} alt="" />
          </div>
        ) : (
          // Every Tell sentence there is has been written for
          <div className="paper-stack__card paper-today__card paper-today__card--finished">
            <div className="paper-today__tell">
              <span className="paper-status paper-status--done">All done</span>
              <p className="paper-today__sentence">You showed every sentence!</p>
              <p className="paper-today__hint">Come back later for more.</p>
              <Link to="/Collections" className="paper-btn paper-btn--action paper-today__start">
                See the class collection
              </Link>
            </div>
          </div>
        )}
        <div className="paper-today__scribbles">
          <Scribbles mood={today ? "idle" : "happy"} size={120} />
        </div>
      </div>

      {latest.length > 0 && (
        <section className="paper-today__mine" aria-labelledby="today-mine">
          <h2 id="today-mine">My sentences</h2>
          <ul>
            {latest.map(({ sentence, tell }) => {
              const { note, label } = standing(sentence);
              return (
                <li key={sentence._id}>
                  <Link to="/MyPage" className={note}>
                    <span className="paper-note__status">{label}</span>
                    <span className="paper-note__show">{sentence.show}</span>
                    {tell && <span className="visually-hidden">for “{tell}”</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

export default Today;
