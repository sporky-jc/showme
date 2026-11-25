import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import Scribbles from "../components/Scribbles";
import PageLoading from "../components/PageLoading";
import SignInPrompt from "../components/SignInPrompt";
import { useStudentData } from "../components/useStudentData";
import { createSentence, editSentences, type SaveResult } from "../actions/usersentences";
import { fetchUser } from "../actions/user";
import type { AppDispatch, RootState } from "../reducers/types";
import { dayOf, nextDay } from "../days";
import { askOf, classicId, tellById, withoutAsk } from "../tells";
import RefresherButton from "../components/RefresherButton";
import { standing } from "../components/standing";
import { SENSE_KEYS, SENSE_NAMES, SENSE_TIPS, repeatedTellWord, senseWords } from "../senses";
import { useFeature } from "../features";
import type { OwnSentence } from "../api/types";
import type { MAX_CHARACTERS } from "../../../backend/reviewer/contract";

// The five senses in order, each with the questions Scribbles asks (see
// SENSE_TIPS in senses.ts). Pressing a sense again asks its next question.
const SENSES = SENSE_KEYS.map((key) => ({ key, name: SENSE_NAMES[key], tips: SENSE_TIPS[key] }));
// What senseWords finds in a sentence that uses no sense
const NO_SENSES = senseWords("");

// A sentence this long has room for a detail
const WORD_GOAL = 8;

// The longest Show sentence the server saves (MAX_CHARACTERS in the
// backend's reviewer/contract.ts). Only its type is imported, so no backend
// code reaches the website, and the type is the number itself: if the
// backend's changes, the type check fails until this matches.
const MAX_LENGTH: typeof MAX_CHARACTERS = 600;
// How close to it the page starts saying how many characters are left
const LENGTH_WARNING = 50;

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

// The sentence the server has, as the page shows it once it's sent
type Sent = Pick<OwnSentence, "tell" | "show" | "approved" | "toRedo">;

// What the sent page says, from where the sentence stands (see standing.ts).
// again: the server already had it, from an earlier press whose answer was
// lost on the way back, so it may have been checked since.
const sentWords = (sentence: Sent, again: boolean) => {
  const { label } = standing(sentence);
  if (sentence.approved) {
    return {
      heading: "You already sent this one! It's in the gallery.",
      badge: "paper-status paper-status--done",
      label,
    };
  }
  if (sentence.toRedo) {
    return {
      heading: "You already sent this one! Scribbles sent it back for another try.",
      badge: "paper-status paper-status--retry",
      label,
    };
  }
  return {
    heading: again ? "You already sent this one! Scribbles is checking it." : "Scribbles is checking!",
    badge: "paper-status paper-status--turn",
    label,
  };
};

// What the page says when a sentence wasn't saved (see SaveResult)
function problemFor(result: SaveResult, text: string): string {
  switch (result.kind) {
    case "already-sent":
      return "You already sent a sentence for this day! Open My sentences to see it.";
    case "missing":
      return "We couldn't find that sentence anymore. Open My sentences to see your sentences.";
    case "too-many":
      return result.message ?? "That's a lot of sending! Wait a minute, then try again.";
    case "refused":
      return text.trim().length > MAX_LENGTH
        ? "Your sentence is too long. Make it shorter."
        : "Scribbles couldn't take that sentence. Change it a little, then press Ask Scribbles again.";
    default:
      return "We couldn't send your sentence. Check your internet connection, then press Ask Scribbles again.";
  }
}

// The Write page: the next Tell sentence and a big box to show it in, with
// Scribbles beside it. Also where a sentence is edited (/Write/<its id>).
// Once the server has the sentence, the page says Scribbles is checking it.
// States that show only a message (sign in, couldn't load, not found, all
// done) still have the page's name as a heading, for screen readers.
function WriteSentence({ id }: { id: string | undefined }) {
  const user = useSelector((state: RootState) => state.user);
  const tellSentences = useSelector((state: RootState) => state.tellsentences);
  const userSentences = useSelector((state: RootState) => state.usersentences);
  // The sense buttons, their tips and the sense hints (see features.ts)
  const senseCoach = useFeature("senseCoach");
  const dispatch = useDispatch<AppDispatch>();
  const signedIn = Object.keys(user).length !== 0;

  const { loaded, retry } = useStudentData();

  // What the student is typing (null until they type: an edit starts from
  // the sentence as it is), the sense Scribbles is asking about, whether the
  // server is being asked, what went wrong if it didn't save, and the
  // sentence it has (again: it already had one for this day).
  const [typed, setTyped] = useState<string | null>(null);
  const [sense, setSense] = useState<{ index: number; turn: number } | null>(null);
  // Whether Scribbles' bubble still shows that sense's question: typing
  // after asking brings back what he thinks of the sentence
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  // (A problem may come with the student's sentence to open: the one the
  // server already has for this day.)
  const [problem, setProblem] = useState<{ message: string; open?: string } | null>(null);
  const [sent, setSent] = useState<{ sentence: Sent; again: boolean } | null>(null);
  // "Need an idea?": whether the help under the button is open. Null until
  // the student presses it; until then it's open only if a refresher opened
  // by itself (below), so its button is there when the refresher closes.
  const [ideasPressed, setIdeasPressed] = useState<boolean | null>(null);
  const [metRefresher, setMetRefresher] = useState(false);

  // Once sent, the page changes under the reader: move them to its heading
  const sentHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) sentHeading.current?.focus();
  }, [sent]);

  if (!signedIn) {
    return (
      <div className="paper-write">
        <h1 className="visually-hidden">Write</h1>
        <SignInPrompt>Sign in to write your own sentences.</SignInPrompt>
      </div>
    );
  }

  if (sent) {
    const { heading, badge, label } = sentWords(sent.sentence, sent.again);
    const waiting = !sent.sentence.approved && !sent.sentence.toRedo;
    return (
      <div className="paper-write paper-write--sent">
        <div className="paper-write__checking">
          <Scribbles
            mood={sent.sentence.approved ? "happy" : "thinking"}
            prop={sent.sentence.approved ? "check" : "note"}
            size={150}
            decorative
            // Just sent: he catches it. Not for one sent before (again).
            reaction={waiting && !sent.again ? "catch" : undefined}
          />
          <div>
            <h1 ref={sentHeading} tabIndex={-1}>
              {heading}
            </h1>
            {waiting && (
              <p className="paper-write__later">
                Come back later! Once Scribbles approves it, it will appear in
                the Show ME gallery.
              </p>
            )}
          </div>
        </div>
        <div className="paper-stack">
          <div className="paper-stack__card paper-write__sent-card">
            <span className={badge}>{label}</span>
            <p className="paper-write__sent-tell">{withoutAsk(sent.sentence.tell)}</p>
            <p className="paper-write__sent-show">{sent.sentence.show}</p>
          </div>
        </div>
        <div className="paper-write__next">
          <Link to="/" className="paper-btn paper-btn--action">
            Back home
          </Link>
          <Link to="/MySentences" className="paper-btn">
            My sentences
          </Link>
        </div>
      </div>
    );
  }

  if (loaded === "loading") return <PageLoading />;
  if (loaded === "failed") {
    return (
      <div className="paper-write">
        <h1 className="visually-hidden">Write</h1>
        <div className="page-message" role="alert">
          <p>
            We couldn&apos;t load your sentence. Check your internet
            connection, then try again.
          </p>
          <button type="button" className="paper-btn paper-btn--action" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Which sentence this is: the one being edited, with the Tell stored with
  // it, or the next new day's (see days.ts), with that day's Tell. A
  // sentence whose title isn't a day has no number.
  const editing = (id && userSentences.find((sentence) => sentence._id === id)) || null;
  const day = editing ? dayOf(editing.title) : nextDay(userSentences, tellSentences.length);
  // Its Tell in the list, by id: the edited sentence's title, or the next
  // day's on the Classic path (see tells.ts)
  const tellEntry = tellById(tellSentences, editing ? editing.title : day === undefined ? undefined : classicId(day));
  // The Tell's words as stored with the sentence (or the list's, for a new
  // one), and as shown: without the "(Use a Simile)" ask, which the badge says
  const storedTell = editing ? editing.tell : tellEntry?.tell;
  const tell = storedTell === undefined ? undefined : withoutAsk(storedTell);
  const ask = askOf(tellEntry?.technique);
  // Its refresher ("What's a simile?", see RefresherButton). It opens by
  // itself the first time the student writes for a Tell that asks for a
  // technique they haven't seen: on Day 1, the senses. Not while editing,
  // and not before the server has said which ones they've seen.
  const technique = tellEntry?.technique;
  const seen = user.seenRefreshers;
  const firstTime = !editing && technique !== undefined && seen !== undefined && !seen.includes(technique);
  // (It stops being the first time as soon as the profile remembers it.)
  if (firstTime && !metRefresher) setMetRefresher(true);
  const ideasOpen = ideasPressed ?? metRefresher;

  if (id && !editing) {
    return (
      <div className="paper-write">
        <h1 className="visually-hidden">Write</h1>
        <div className="page-message">
          <p>We couldn&apos;t find that sentence.</p>
          <Link to="/MySentences" className="paper-btn paper-btn--action">
            My sentences
          </Link>
        </div>
      </div>
    );
  }

  if (!tell) {
    // Every Tell sentence there is has been written for
    return (
      <div className="paper-write">
        <h1 className="visually-hidden">Write</h1>
        <div className="page-message">
          <p>You showed every sentence! Nice work!</p>
          <Link to="/Gallery" className="paper-btn paper-btn--action">
            See the gallery
          </Link>
        </div>
      </div>
    );
  }

  const text = typed ?? editing?.show ?? "";
  const words = countWords(text);
  const charactersLeft = MAX_LENGTH - text.length;
  const cheer =
    words === 0
      ? "Don't just tell me. Show me!"
      : words < WORD_GOAL
      ? "Keep going, add a detail!"
      : "Nice and vivid!";
  // Which senses the sentence uses (a hint, see senses.ts), and whether it
  // repeats the Tell's telling word. Without the senseCoach feature (see
  // features.ts) the page doesn't look for senses at all.
  const found = senseCoach ? senseWords(text) : NO_SENSES;
  const used = SENSES.filter(({ key }) => found[key]);
  const tellWord = repeatedTellWord(text, tell);
  const clear = words >= WORD_GOAL && (!senseCoach || used.length >= 2) && !tellWord;

  // What Scribbles says. It changes when the sentence reaches a new stage,
  // not with every letter, so a screen reader isn't talked over.
  const coach =
    sense && asking
      ? SENSES[sense.index].tips[sense.turn % SENSES[sense.index].tips.length]
      : editing?.toRedo && typed === null
      ? // A sentence sent back for another try, before any change
        senseCoach
        ? "Let's make it even better. Tap “Need an idea?” for a tip!"
        : "Let's make it even better!"
      : tellWord
      ? `“${tellWord}” is the Tell word. Can you show it instead?`
      : words === 0
      ? senseCoach
        ? "Stuck? Tap “Need an idea?” and I'll help you think!"
        : "Write your sentence. I'll try to picture it!"
      : words < WORD_GOAL
      ? "It's getting clearer! Add a detail."
      : !senseCoach
      ? "I can picture it!"
      : used.length === 0
      ? "I see shapes, but no details yet. What would you see or hear?"
      : used.length === 1
      ? "Ooh, getting there! Can you add a second sense?"
      : `I can picture it! You used ${used.length} senses.`;

  // The Tell's photo: small beside the Tell on a phone, in a frame of its
  // own on a wide screen (paper.css shows one of the two)
  const image = tellEntry?.image;

  const askAbout = (index: number) => {
    setSense((now) => ({ index, turn: now?.index === index ? now.turn + 1 : 0 }));
    setAsking(true);
  };

  // Send the sentence to the server. The words stay in the box until it
  // answers, so nothing is lost if it can't be reached; the button is off
  // meanwhile, so a double press can't send the same day twice.
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !tell || text.trim() === "") return;
    // A new sentence is for its Tell, named by the Tell's id
    if (!editing && !tellEntry) return;
    setSaving(true);
    setProblem(null);
    // The server sets the rest itself: the day's Tell (from the same list),
    // and an edit goes back to waiting to be checked, with a new date
    const result = editing
      ? await dispatch(editSentences({ title: editing.title, show: text }))
      : // The Tell goes along only for an older backend; the server looks it up itself
        await dispatch(createSentence({ title: tellEntry?.id ?? "", show: text, tell: storedTell }));
    setSaving(false);
    if (result.kind === "saved") {
      dispatch(fetchUser());
      // As the server saved it (trimmed), with the Tell it stored
      setSent({ sentence: { ...result.sentence, tell: result.sentence.tell ?? storedTell ?? tell }, again: false });
      return;
    }
    if (result.kind === "already-sent" && result.sentence) {
      if (result.sentence.show === text.trim()) {
        // This same sentence, saved by an earlier press whose answer was
        // lost on the way back: show it as the server has it
        setSent({ sentence: result.sentence, again: true });
        return;
      }
      // A different one for this day (another tab or device): keep what the
      // student typed, and point to the one already there
      setProblem({
        message:
          "You already wrote a sentence for this day. Open it in My sentences to change it.",
        open: result.sentence._id,
      });
      return;
    }
    setProblem({ message: problemFor(result, text) });
  }

  return (
    <div className="paper-write">
      <div className="paper-write__top">
        <Link to="/" className="paper-write__back">
          <span aria-hidden>←</span> Back home
        </Link>
      </div>

      <div className="paper-stack">
        <form className="paper-stack__card paper-write__card" onSubmit={send}>
          <div className="paper-write__head">
            <div className="paper-write__about">
              {image && <img className="paper-write__thumb" src={image} alt="" width={84} height={84} />}
              <h1 className="paper-write__tell">
                <span className="paper-status paper-status--retry">
                  {editing ? (day ? `Sentence ${day} · Tell` : "Sentence · Tell") : "Your next Tell"}
                </span>
                <span className="paper-write__sentence">{tell}</span>
              </h1>
            </div>
            {ask && (
              <div className="paper-write__asks">
                <p className="paper-status paper-status--turn paper-write__ask">{ask}</p>
              </div>
            )}

            {editing?.approved && (
              <p className="paper-write__notice">
                This one is in the gallery. If you change it, Scribbles
                checks it again first.
              </p>
            )}
          </div>

          <div className="paper-write__writing">
            <label className="paper-write__label" htmlFor="show-sentence">
              Now show it
            </label>
            <textarea
              id="show-sentence"
              className="paper-write__box"
              rows={4}
              value={text}
              placeholder="Don't just tell me, instead SHOW ME!"
              aria-describedby="show-count"
              maxLength={MAX_LENGTH}
              onChange={(event) => {
                setTyped(event.target.value);
                setAsking(false);
              }}
            />
            <p id="show-count" className="paper-write__count">
              <strong>
                {words} {words === 1 ? "word" : "words"}
              </strong>{" "}
              · {cheer}
              {charactersLeft <= LENGTH_WARNING &&
                (charactersLeft >= 0
                  ? ` · ${charactersLeft} ${charactersLeft === 1 ? "character" : "characters"} left`
                  : ` · ${-charactersLeft} too many characters`)}
            </p>
          </div>

          {/* Right after the box, in the page's order too, so the keyboard
              reaches the button before Scribbles' help */}
          <div className="paper-write__foot">
            <button
              type="submit"
              className="paper-btn paper-btn--action paper-write__send"
              disabled={saving || text.trim() === ""}
            >
              {saving ? "Sending…" : "Ask Scribbles"}
            </button>
            {problem && (
              <p className="paper-write__failed" role="alert">
                {problem.message}
                {problem.open && (
                  <>
                    {" "}
                    <Link to={`/Write/${problem.open}`}>Open my sentence</Link>
                  </>
                )}
              </p>
            )}
          </div>

          {/* The Tell's picture, and what Scribbles thinks of the sentence */}
          <div className="paper-write__coach">
            <div className="paper-write__frame">
              <div className="paper-write__window">
                {image && (
                  <img
                    className="paper-write__photo"
                    src={image}
                    alt=""
                    width={800}
                    height={500}
                  />
                )}
              </div>
            </div>
            <div className="paper-write__talk">
              <Scribbles
                mood={tellWord ? "worried" : clear ? "happy" : sense && asking ? "thinking" : "idle"}
                prop={clear ? "none" : "note"}
                size={110}
                decorative
              />
              <p className="paper-bubble" aria-live="polite">
                {coach}
              </p>
            </div>
          </div>

          {/* All the help, behind one button: the Tell's refresher (with its
              film) and, with the senseCoach feature, the sense buttons and
              their tips */}
          {(technique || senseCoach) && (
            <div className="paper-write__ideas">
              <button
                type="button"
                className="paper-btn paper-write__idea"
                aria-expanded={ideasOpen}
                aria-controls="write-ideas"
                onClick={() => setIdeasPressed(!ideasOpen)}
              >
                Need an idea?
              </button>
              <div id="write-ideas" className="paper-write__idea-box" hidden={!ideasOpen}>
                {technique && <RefresherButton technique={technique} firstTime={firstTime} />}
                {senseCoach && (
                  <div>
                    <p className="paper-write__hint" id="senses-hint">
                      Tap a sense for an idea. It lights up when your sentence uses it.
                    </p>
                    <div className="paper-write__senses" role="group" aria-label="Senses">
                      {SENSES.map(({ key, name }, index) => {
                        const word = found[key];
                        return (
                          <button
                            type="button"
                            key={key}
                            className={word ? "paper-write__sense paper-write__sense--used" : "paper-write__sense"}
                            style={{ "--sense-color": `var(--paper-sense-${key})` } as React.CSSProperties}
                            aria-pressed={sense?.index === index}
                            aria-describedby={word ? `sense-${key}-word` : undefined}
                            onClick={() => askAbout(index)}
                          >
                            {name}
                            {word && (
                              <span className="paper-write__sense-word" id={`sense-${key}-word`} aria-hidden>
                                Used: {word}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </form>
      </div>
    </div>
  );
}

// With an id in the address, that sentence is being edited. Each sentence
// gets a page of its own (the key), so nothing typed for one carries over to
// another.
// The same goes for each student: if the login runs out and someone else
// signs in here (a shared tablet), they don't get the last student's words.
function Write() {
  const { id } = useParams();
  const who = useSelector((state: RootState) => state.user.id);
  return <WriteSentence key={`${who ?? ""}/${id ?? "new"}`} id={id} />;
}

export default Write;
