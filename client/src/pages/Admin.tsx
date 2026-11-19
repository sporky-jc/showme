import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useSelector, useDispatch, useStore } from "react-redux";
import Scribbles from "../components/Scribbles";
import PageLoading from "../components/PageLoading";
import {
  updatePendingApprovalSentences,
  fetchApprovalSentences,
} from "../actions/approvalsentences";
import type { ReviewDecision, SentenceWithAuthor } from "../api/types";
import type { AppDispatch, RootState } from "../reducers/types";

// Some accounts have no last name
const nameOf = ({ author }: SentenceWithAuthor) =>
  author.lastName ? `${author.firstName} ${author.lastName}` : author.firstName;

// How long a sentence has waited, in words ("today", "2 days ago"), by the
// calendar: one sent yesterday afternoon reads "yesterday" this morning
const waitedSince = (createdAt: string, now: number) => {
  const midnight = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(now) - midnight(new Date(createdAt).getTime())) / 86_400_000);
  if (!(days >= 1)) return "today"; // also a missing or future date
  return days === 1 ? "yesterday" : `${days} days ago`;
};

// The Teacher page, for the reviewer who reads as Scribbles: the sentences
// waiting for review, longest wait first, each on a card with the way to
// approve it or send it back.
function Admin() {
  // grab global state from redux store
  const user = useSelector((state: RootState) => state.user);
  // Whether the server has said who is logged in since the page opened. Until
  // then `user` is only who this browser remembers, perhaps a student who
  // used it earlier while an admin has just logged in.
  const sessionChecked = useSelector(
    (state: RootState) => state.session.checked
  );
  const sentencesAwaitingApproval = useSelector(
    (state: RootState) => state.approvalsentences
  );

  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();
  const navigate = useNavigate();
  const isAdmin = user.isAdmin === true;

  // Whether the queue has arrived, the sentence being saved (its buttons and
  // everyone else's wait), what just happened (read out by screen readers),
  // and a decision the server didn't take.
  const [loaded, setLoaded] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  // Why the last decision didn't count, if it didn't: it couldn't be saved,
  // or the sentence had changed or was already reviewed ("stale")
  const [failed, setFailed] = useState<false | "failed" | "stale">(false);
  // "Now", for how long each sentence has waited: read once, when the page
  // opens, so the cards don't change while they're being read
  const [now] = useState(() => Date.now());
  const heading = useRef<HTMLHeadingElement>(null);

  // Retrieve all sentences pending approval (the server checks again), once
  // the user is an admin. Only when that changes (or on Try again), not on
  // every update of the user or the login check: a second request answered
  // after an approval would bring back the queue from before it.
  useEffect(() => {
    if (!isAdmin) return;
    let current = true;
    dispatch(fetchApprovalSentences()).then((arrived) => {
      if (current) setLoaded(arrived ? "ready" : "failed");
    });
    return () => {
      current = false;
    };
  }, [isAdmin, dispatch, attempt]);

  // The server says this isn't an admin: send back to home page. Not before
  // it has answered, or a remembered student sends an admin away.
  useEffect(() => {
    if (sessionChecked && !isAdmin) navigate("/");
  }, [sessionChecked, isAdmin, navigate]);

  // Where the keyboard goes once a decision has been answered: back to the
  // pressed button if it didn't save, or to the card that took its place.
  // Set just before the redraw that turns the buttons back on, and used
  // (once) right after it.
  const focusNext = useRef<{ id: string } | { place: number } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const cards = list.current?.querySelectorAll("li") ?? [];
    const card =
      "id" in target
        ? list.current?.querySelector(`li[data-sentence="${CSS.escape(target.id)}"]`)
        : cards[Math.min(target.place, cards.length - 1)];
    const button = card?.querySelector("button");
    // No card left to go to (the queue is empty, or it couldn't be loaded):
    // the heading
    if (button) button.focus();
    else heading.current?.focus();
  });

  // `sentence` is the one on the card that was pressed, passed in directly:
  // looking it up by position could pick another one if the queue changed
  // between drawing the card and the press. `place` is where its card was.
  async function decide(sentence: SentenceWithAuthor, status: ReviewDecision, place: number) {
    if (saving) return;
    setSaving(sentence._id);
    setFailed(false);
    const outcome = await dispatch(updatePendingApprovalSentences(status, sentence));
    if (outcome !== "saved") {
      // Ask for the queue again: the sentence may be gone (someone else
      // handled it) or changed (the student edited it, so it comes back with
      // its new words to read), and its old card shouldn't stay to fail again
      const reloaded = await dispatch(fetchApprovalSentences());
      focusNext.current = { id: sentence._id };
      setSaving(null);
      // "Here's the latest" only if the latest did arrive
      setFailed(outcome === "stale" && reloaded ? "stale" : "failed");
      return;
    }
    focusNext.current = { place };
    setSaving(null);
    // How many are left, so two decisions in a row never read the same
    // (a screen reader stays silent when the words don't change)
    const left = store.getState().approvalsentences.length;
    setSaid(
      (status === "approve"
        ? `Approved ${nameOf(sentence)}'s sentence.`
        : `Sent ${nameOf(sentence)}'s sentence back to try again.`) +
        (left === 0 ? " All caught up!" : ` ${left} waiting.`)
    );
  }

  // Only render page if logged in user is admin; while the server is still
  // being asked, show the usual loader
  if (!isAdmin) {
    return sessionChecked ? null : <PageLoading />;
  }
  if (loaded === "loading") return <PageLoading />;

  // Longest wait first, so nobody is left at the bottom of a growing queue
  const queue = [...sentencesAwaitingApproval].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const count = queue.length;

  return (
    <div className="paper-review">
      <div className="paper-review__top">
        {/* With nothing waiting he moves down to the "All caught up!" card */}
        {!(loaded === "ready" && count === 0) && <Scribbles prop="check" size={70} decorative />}
        <h1 ref={heading} tabIndex={-1}>
          Needs your eyes
        </h1>
        {loaded === "ready" && count > 0 && (
          <span className="paper-status paper-status--turn">{count} waiting</span>
        )}
      </div>
      <p className="visually-hidden" role="status">
        {said}
      </p>
      {/* Above the queue, and above "All caught up!" too: the sentence that
          didn't count may have been the last one */}
      {failed && loaded !== "failed" && (
        <p className="paper-review__failed" role="alert">
          {failed === "stale"
            ? "This sentence changed or someone already reviewed it. Here's the latest."
            : "That didn't save. If the sentence is still here, press the button again."}
        </p>
      )}

      {loaded === "failed" ? (
        <div className="page-message" role="alert">
          <p>
            We couldn&apos;t load the sentences. Check your internet
            connection, then try again.
          </p>
          <button
            type="button"
            className="paper-btn paper-btn--action"
            onClick={() => {
              setLoaded("loading");
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : count === 0 ? (
        <div className="paper-review__done">
          <Scribbles mood="happy" prop="check" size={130} decorative />
          <p className="paper-review__caught-up">All caught up!</p>
          <p>No sentences are waiting.</p>
          <Link to="/Gallery" className="paper-btn paper-btn--action">
            See the gallery
          </Link>
        </div>
      ) : (
        <>
          <ol className="paper-review__queue" ref={list}>
            {queue.map((sentence, place) => {
              const name = nameOf(sentence);
              return (
                // Keyed by the sentence, so a card always stays that
                // sentence's card when the queue changes, instead of being
                // reused to show another one
                <li className="paper-review__card" key={sentence._id} data-sentence={sentence._id}>
                  <div className="paper-review__who">
                    <h2>{name}</h2>
                    <span className="paper-review__waited">
                      Sent {waitedSince(sentence.createdAt, now)}
                    </span>
                  </div>
                  <p className="paper-review__tell">{sentence.tell}</p>
                  <p className="paper-review__show">{sentence.show}</p>
                  <div className="paper-review__decide">
                    <button
                      type="button"
                      className="paper-btn paper-review__approve"
                      aria-label={
                        saving === sentence._id ? `Saving: ${name}'s sentence` : `Approve: ${name}'s sentence`
                      }
                      disabled={saving !== null}
                      onClick={() => decide(sentence, "approve", place)}
                    >
                      {saving === sentence._id ? "Saving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      className="paper-btn paper-review__again"
                      aria-label={`Try again: ${name}'s sentence`}
                      disabled={saving !== null}
                      onClick={() => decide(sentence, "redo", place)}
                    >
                      Try again
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

export default Admin;
