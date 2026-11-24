import React, { type CSSProperties } from "react";
import { Link } from "react-router";
import { useSelector } from "react-redux";
import Scribbles from "../components/Scribbles";
import PageLoading from "../components/PageLoading";
import { standing } from "../components/standing";
import { useStudentData } from "../components/useStudentData";
import type { RootState } from "../reducers/types";
import { nextDay } from "../days";
import { askOf, classicId, hintFor, tellById, withoutAsk } from "../tells";
import { SENSE_NAMES, SENSE_TIPS, leastUsedSense, senseCounts } from "../senses";

// How many of the student's latest sentences to show under their next Tell
const LATEST = 3;

// A signed-in student's home: their next Tell sentence with the way to start
// writing, and where their latest sentences stand.
function Today() {
  const user = useSelector((state: RootState) => state.user);
  const tellSentences = useSelector((state: RootState) => state.tellsentences);
  const userSentences = useSelector((state: RootState) => state.usersentences);
  // The next Tell is the one after the student's last sentence, so it's only
  // known once their list and the Tell sentences have arrived. Without both,
  // say so: a guess would show the wrong day, or "all done".
  const { loaded, retry } = useStudentData();

  if (loaded === "loading") return <PageLoading />;
  if (loaded === "failed") {
    return (
      <div className="paper-today">
        <div className="page-message" role="alert">
          <p>
            We couldn&apos;t load your next sentence. Check your internet
            connection, then try again.
          </p>
          <button
            type="button"
            className="paper-btn paper-btn--action"
            onClick={retry}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // The day after the latest one written (see days.ts), or none: all done
  const next = nextDay(userSentences, tellSentences.length);
  const today = next === undefined ? undefined : tellById(tellSentences, classicId(next));
  // What the next Tell asks for beyond the senses, as a badge (see tells.ts)
  const ask = askOf(today?.technique);
  const approved = userSentences.filter((sentence) => sentence.approved);
  const shown = approved.length;
  // How often each sense is used in the sentences that made it into the
  // gallery (see senses.ts)
  const used = senseCounts(approved.map((sentence) => sentence.show));
  // Scribbles' tip for today: the sense the student uses least, with one of
  // its questions (a different one each day)
  const tipSense = leastUsedSense(used);
  const tipName = SENSE_NAMES[tipSense];
  const tips = SENSE_TIPS[tipSense];
  const tip = tips[(next ?? 0) % tips.length];
  // Something is waiting for review: Scribbles is "checking" it
  const checking = userSentences.some((sentence) => !sentence.approved && !sentence.toRedo);
  // Newest first, each with the Tell stored with it
  const latest = userSentences
    .map((sentence) => ({ sentence, tell: sentence.tell }))
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
              <span className="paper-status paper-status--retry">Your next Tell</span>
              <p className="paper-today__sentence">“{withoutAsk(today.tell)}”</p>
              {ask && <span className="paper-status paper-status--turn">{ask}</span>}
              <p className="paper-today__hint">{hintFor(today.technique)}</p>
              <p
                className="paper-today__tip"
                style={{ "--tip-color": `var(--paper-sense-${tipSense})` } as CSSProperties}
              >
                <strong className="paper-today__tip-try">
                  {used[tipSense] === 0
                    ? `Try ${tipName} today!`
                    : `You use ${tipName} the least. Try it today!`}
                </strong>{" "}
                {tip}
              </p>
              <Link to="/Write" className="paper-btn paper-btn--action paper-today__start">
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
              <p className="paper-today__hint">Nice work!</p>
              <Link to="/Gallery" className="paper-btn paper-btn--action paper-today__start">
                See the gallery
              </Link>
            </div>
          </div>
        )}
        <div className="paper-today__scribbles">
          <Scribbles
            mood={checking ? "thinking" : today ? "idle" : "happy"}
            prop={checking ? "note" : "none"}
            size={120}
          />
        </div>
      </div>

      {latest.length > 0 && (
        <section className="paper-today__mine" aria-labelledby="today-mine">
          <h2 id="today-mine">My sentences</h2>
          {checking && (
            <p className="paper-today__later">
              Come back later! Once Scribbles approves it, it will appear in
              the Show ME gallery.
            </p>
          )}
          <ul>
            {latest.map(({ sentence, tell }) => {
              const { note, label } = standing(sentence);
              return (
                <li key={sentence._id}>
                  {/* One Scribbles sent back opens ready to rewrite */}
                  <Link to={sentence.toRedo ? `/Write/${sentence._id}` : "/MySentences"} className={note}>
                    <span className="paper-note__status">{label}</span>
                    <span className="paper-note__show">{sentence.show}</span>
                    {tell && <span className="visually-hidden">for “{withoutAsk(tell)}”</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="paper-card paper-today__films" aria-labelledby="today-films">
        <div>
          <h2 id="today-films">Films</h2>
          <p>Short films about ways to show, not tell.</p>
        </div>
        <Link to="/Films" className="paper-btn">
          Watch a film
        </Link>
      </section>
    </div>
  );
}

export default Today;
