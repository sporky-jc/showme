import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useSelector, useDispatch, useStore } from "react-redux";
import Scribbles from "../components/Scribbles";
import ScribblesNote from "../components/ScribblesNote";
import { noteKind } from "../components/noteKind";
import type { NoteKind } from "../components/noteKind";
import PageLoading from "../components/PageLoading";
import * as api from "../api";
import {
  updatePendingApprovalSentences,
  fetchApprovalSentences,
} from "../actions/approvalsentences";
import type { QueueSentence, ReviewDecision, ReviewTip, ReviewTipId } from "../api/types";
import type { AppDispatch, RootState } from "../reducers/types";

// Some accounts have no last name
const nameOf = ({ author }: QueueSentence) =>
  author.lastName ? `${author.firstName} ${author.lastName}` : author.firstName;

// How long a sentence has waited, in words ("today", "2 days ago"), by the
// calendar: one sent yesterday afternoon reads "yesterday" this morning
const waitedSince = (createdAt: string, now: number) => {
  const midnight = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(now) - midnight(new Date(createdAt).getTime())) / 86_400_000);
  if (!(days >= 1)) return "today"; // also a missing or future date
  return days === 1 ? "yesterday" : `${days} days ago`;
};

// The show sentence, with the words Scribbles found misspelled marked
const withMisspellings = (show: string, misspelled: string[] = []) => {
  if (misspelled.length === 0) return show;
  const escaped = misspelled.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = show.split(new RegExp(`\\b(${escaped.join("|")})\\b`, "g"));
  // Each part keyed by where it starts in the sentence
  let at = 0;
  return parts.map((part, i) => {
    const start = at;
    at += part.length;
    // The split keeps each match at an odd place
    return i % 2 === 1 ? (
      <mark key={`word-${start}`} className="paper-review__misspelled">
        {part}
        <span className="visually-hidden"> (misspelled)</span>
      </mark>
    ) : (
      <React.Fragment key={`text-${start}`}>{part}</React.Fragment>
    );
  });
};

// How many tips "Try again" offers before "See all tips"
const TIPS_SHOWN = 3;

// The Teacher page, for the reviewer who reads as Scribbles: the sentences
// waiting for review, each on a card with the way to approve it or send it
// back with a tip the student sees. Where Scribbles has read a sentence
// first (the AI reviewer, backend/reviewer/), his note says what he
// suggests; the teacher still decides. A sentence that may mean a student
// needs help comes first, then the longest wait.
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
  // The tips a teacher can send back, and the card whose "Try again" is
  // open: the tip chosen there (null: none), and whether every tip shows
  const [tips, setTips] = useState<ReviewTip[]>([]);
  const [choosing, setChoosing] = useState<{ id: string; tip: ReviewTipId | null; all: boolean } | null>(null);

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

  // The tips for "Try again". Without them, only Scribbles' pick and "No
  // tip" are offered.
  useEffect(() => {
    if (!isAdmin) return;
    let current = true;
    api
      .fetchReviewTips()
      .then(({ data }) => {
        if (current && Array.isArray(data)) {
          setTips(data.filter((tip) => typeof tip?.id === "string" && typeof tip?.text === "string"));
        }
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [isAdmin]);

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
  async function decide(sentence: QueueSentence, status: ReviewDecision, place: number, tip: ReviewTipId | null = null) {
    if (saving) return;
    setSaving(sentence._id);
    setFailed(false);
    const outcome = await dispatch(updatePendingApprovalSentences(status, sentence, tip));
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
    setChoosing(null);
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

  // A sentence that may mean a student needs help first, then the longest
  // wait, so nobody is left at the bottom of a growing queue
  const kindOf = (sentence: QueueSentence): NoteKind | null =>
    sentence.suggestion ? noteKind(sentence.suggestion) : null;
  const queue = [...sentencesAwaitingApproval].sort(
    (a, b) =>
      Number(kindOf(b) === "check-in") - Number(kindOf(a) === "check-in") ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const count = queue.length;
  // How many of each note, for the stickers under the heading
  const tally = (kinds: NoteKind[]) => queue.filter((sentence) => kinds.includes(kindOf(sentence) as NoteKind)).length;
  const stickers = [
    { label: "to check in on", n: tally(["check-in", "held"]), className: "paper-review__sticker paper-review__sticker--check-in" },
    { label: "ready", n: tally(["ready"]), className: "paper-review__sticker paper-review__sticker--ready" },
    { label: "try again", n: tally(["again"]), className: "paper-review__sticker paper-review__sticker--again" },
    { label: "your call", n: tally(["your-call"]), className: "paper-review__sticker paper-review__sticker--your-call" },
  ].filter((sticker) => sticker.n > 0);

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
      {loaded === "ready" && stickers.length > 0 && (
        <div className="paper-review__summary">
          <p>Scribbles read them first. You decide.</p>
          <ul aria-label="Scribbles' notes">
            {stickers.map((sticker) => (
              <li key={sticker.label} className={sticker.className}>
                {sticker.n} {sticker.label}
              </li>
            ))}
          </ul>
        </div>
      )}
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
                  <p className="paper-review__show">
                    {withMisspellings(sentence.show, sentence.suggestion?.misspelled)}
                  </p>
                  {sentence.suggestion && (
                    <ScribblesNote suggestion={sentence.suggestion} firstName={sentence.author.firstName} />
                  )}
                  {choosing?.id === sentence._id ? (
                    <TipChooser
                      name={name}
                      firstName={sentence.author.firstName}
                      pick={sentence.suggestion?.verdict === "redo" ? sentence.suggestion.tip?.id ?? null : null}
                      tips={tips}
                      chosen={choosing.tip}
                      all={choosing.all}
                      saving={saving === sentence._id}
                      disabled={saving !== null}
                      onChoose={(tip) => setChoosing({ ...choosing, tip })}
                      onShowAll={() => setChoosing({ ...choosing, all: true })}
                      onCancel={() => {
                        focusNext.current = { id: sentence._id };
                        setChoosing(null);
                      }}
                      onSend={() => decide(sentence, "redo", place, choosing.tip)}
                    />
                  ) : (
                  <div className="paper-review__decide">
                    <button
                      type="button"
                      className={
                        sentence.suggestion?.verdict === "approve" && kindOf(sentence) === "ready"
                          ? "paper-btn paper-review__approve paper-review__pick"
                          : "paper-btn paper-review__approve"
                      }
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
                      className={
                        kindOf(sentence) === "again"
                          ? "paper-btn paper-review__again paper-review__pick"
                          : "paper-btn paper-review__again"
                      }
                      aria-label={`Try again: ${name}'s sentence`}
                      disabled={saving !== null}
                      onClick={() => {
                        // Scribbles' tip is chosen to start with, when he has one
                        const suggested = sentence.suggestion;
                        setChoosing({
                          id: sentence._id,
                          tip: suggested?.verdict === "redo" ? suggested.tip?.id ?? null : null,
                          all: false,
                        });
                      }}
                    >
                      Try again
                    </button>
                  </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

// "Try again", opened: which tip the student sees with it. Scribbles' pick
// (when he has one) is chosen to start with; a few more tips, then all of
// them on request, or none.
function TipChooser({
  name,
  firstName,
  pick,
  tips,
  chosen,
  all,
  saving,
  disabled,
  onChoose,
  onShowAll,
  onCancel,
  onSend,
}: {
  name: string;
  firstName: string;
  pick: ReviewTipId | null;
  tips: ReviewTip[];
  chosen: ReviewTipId | null;
  all: boolean;
  saving: boolean;
  disabled: boolean;
  onChoose: (tip: ReviewTipId | null) => void;
  onShowAll: () => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  // Keyboard users land on the chosen tip when it opens
  useEffect(() => {
    group.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
  }, []);

  const others = tips.filter((tip) => tip.id !== pick);
  const shown = all ? others : others.slice(0, pick ? TIPS_SHOWN - 1 : TIPS_SHOWN);
  // Scribbles' pick, even if the list of tips couldn't be loaded
  const picked = pick ? tips.find((tip) => tip.id === pick) : undefined;
  const options: { id: ReviewTipId | null; text: string; isPick?: boolean }[] = [
    ...(pick ? [{ id: pick, text: picked?.text ?? "Scribbles' tip", isPick: true }] : []),
    ...shown.map((tip) => ({ id: tip.id, text: tip.text })),
    // "No tip" stays chosen if it was, even when it's off the short list
    { id: null, text: "No tip, just \u201cTry again\u201d" },
  ];
  const groupName = `tip-${name}`;

  return (
    <div className="paper-review__choose">
      <div className="paper-review__tips" role="radiogroup" aria-label={`Which tip should ${firstName} see?`} ref={group}>
        <p className="paper-review__tips-question" aria-hidden="true">
          Which tip should {firstName} see?
        </p>
        {options.map((option) => (
          <label
            key={option.id ?? "none"}
            className={chosen === option.id ? "paper-review__tip paper-review__tip--chosen" : "paper-review__tip"}
          >
            <input
              type="radio"
              name={groupName}
              checked={chosen === option.id}
              disabled={disabled}
              onChange={() => onChoose(option.id)}
            />
            <span>{option.text}</span>
            {option.isPick && <span className="paper-review__tip-pick">Scribbles&apos; pick</span>}
          </label>
        ))}
        {!all && others.length > shown.length && (
          <button type="button" className="paper-review__all-tips" onClick={onShowAll} disabled={disabled}>
            See all tips
          </button>
        )}
      </div>
      <div className="paper-review__decide">
        <button type="button" className="paper-btn paper-review__cancel" onClick={onCancel} disabled={disabled}>
          Cancel
        </button>
        <button
          type="button"
          className="paper-btn paper-review__send"
          aria-label={saving ? `Saving: ${name}'s sentence` : `Send back: ${name}'s sentence`}
          disabled={disabled}
          onClick={onSend}
        >
          {saving ? "Saving…" : chosen ? "Send back with this tip" : "Send back"}
        </button>
      </div>
    </div>
  );
}

export default Admin;
