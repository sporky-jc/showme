import React, { useState } from "react";
import { Link } from "react-router";
import { useSelector } from "react-redux";
import PageLoading from "../components/PageLoading";
import Scribbles from "../components/Scribbles";
import SignInPrompt from "../components/SignInPrompt";
import { standing } from "../components/standing";
import { useStudentData } from "../components/useStudentData";
import * as config from "../config";
import type { RootState } from "../reducers/types";
import { dayOf, nextDay } from "../days";

// My sentences: everything the signed-in student has written, newest first,
// each on a paper note colored by where it stands, with the way to change
// it. Writing happens on the Write page.
function MyPage() {
  const tellSentences = useSelector((state: RootState) => state.tellsentences);
  const user = useSelector((state: RootState) => state.user);
  const userSentences = useSelector((state: RootState) => state.usersentences);
  const signedIn = Object.keys(user).length !== 0;

  const { loaded, retry } = useStudentData();
  const [activePage, setActivePage] = useState(1);

  if (!signedIn) {
    return (
      <div className="paper-mine">
        <h1 className="visually-hidden">My sentences</h1>
        <SignInPrompt>Sign in to write your own sentences and see them here.</SignInPrompt>
      </div>
    );
  }

  if (loaded === "loading") return <PageLoading />;
  if (loaded === "failed") {
    return (
      <div className="paper-mine">
        <h1 className="visually-hidden">My sentences</h1>
        <div className="page-message" role="alert">
          <p>
            We couldn&apos;t load your sentences. Check your internet
            connection, then try again.
          </p>
          <button type="button" className="paper-btn paper-btn--action" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Everything below is worked out from the store each time this draws, so
  // it can never be out of date.
  const itemsPerPage = config.SentencesPerPageForMyPage;
  const pageCount = Math.ceil(userSentences.length / itemsPerPage);
  // If the list shrinks, don't stay on a page that no longer exists
  const page = Math.min(activePage, Math.max(pageCount, 1));
  // Newest first, then the slice for the open page. Each entry keeps its
  // position in the original list (index), for sentences whose title isn't
  // a day (see days.ts).
  const pageItems = userSentences
    .map((sentence, index) => ({ sentence, index }))
    .reverse()
    .slice((page - 1) * itemsPerPage, page * itemsPerPage);
  // There is a Tell sentence the student hasn't written for yet
  const more = nextDay(userSentences, tellSentences.length) !== undefined;

  return (
    <div className="paper-mine">
      <div className="paper-mine__top">
        <h1>My sentences</h1>
        {more && (
          <Link to="/Write" className="paper-btn paper-btn--action">
            Write your next sentence
          </Link>
        )}
      </div>

      {userSentences.length === 0 ? (
        <p className="page-message">
          You haven&apos;t written a sentence yet. Your first Tell is waiting!
        </p>
      ) : (
        <ol className="paper-mine__list">
          {pageItems.map(({ sentence, index }) => {
            const { note, label } = standing(sentence);
            const day = dayOf(sentence.title) ?? index + 1;
            return (
              <li key={sentence._id} className={note}>
                <div className="paper-mine__head">
                  <span className="paper-note__status">{label}</span>
                  <span className="paper-mine__day">Sentence {day}</span>
                </div>
                <p className="paper-mine__show">{sentence.show}</p>
                {/* The tip from the teacher's decision, in Scribbles' words:
                    how to fix it, or praise once it's in the gallery */}
                {sentence.tip && (sentence.toRedo || sentence.approved) && (
                  <div className="paper-mine__tip">
                    <Scribbles
                      mood={sentence.approved ? "happy" : "thinking"}
                      prop={sentence.approved ? "check" : "note"}
                      size={56}
                      decorative
                    />
                    <p
                      className={
                        sentence.approved
                          ? "paper-mine__tip-bubble paper-mine__tip-bubble--praise"
                          : "paper-mine__tip-bubble"
                      }
                    >
                      <span className="paper-mine__tip-label">
                        {sentence.approved ? "Scribbles says" : "Scribbles\u2019 tip"}
                      </span>
                      {sentence.tip.text}
                    </p>
                  </div>
                )}
                <div className="paper-mine__foot">
                  <p className="paper-mine__tell">{sentence.tell}</p>
                  <Link
                    to={`/Write/${sentence._id}`}
                    className="paper-mine__edit"
                    aria-label={`${sentence.toRedo ? "Try again" : "Edit"}: sentence ${day}`}
                  >
                    {sentence.toRedo ? "Try again" : "Edit"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {pageCount > 1 && (
        <nav className="paper-mine__pages" aria-label="Pages">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((number) => (
            <button
              type="button"
              key={number}
              aria-current={number === page ? "page" : undefined}
              aria-label={`Page ${number}`}
              onClick={() => setActivePage(number)}
            >
              {number}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
export default MyPage;
