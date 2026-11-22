import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import Scribbles from "../components/Scribbles";
import SenseSticker from "../components/SenseSticker";
import PageLoading from "../components/PageLoading";
import SignInPrompt from "../components/SignInPrompt";
import { useStudentData } from "../components/useStudentData";
import { createSentence, editSentences, type SaveResult } from "../actions/usersentences";
import { fetchUser } from "../actions/user";
import type { AppDispatch, RootState } from "../reducers/types";
import { dayOf, nextDay } from "../days";
import { standing } from "../components/standing";
import { repeatedTellWord, senseWords, type SenseKey } from "../senses";
import type { OwnSentence } from "../api/types";
import type { MAX_CHARACTERS } from "../../../backend/reviewer/contract";

// The five senses, each with questions Scribbles asks to get a writer going.
// They are general on purpose: they work for any Tell sentence. Pressing a
// sense again asks its next question.
const SENSES: readonly { key: SenseKey; name: string; tips: readonly string[] }[] = [
  {
    key: "see",
    name: "See",
    tips: [
      "What would a camera catch? Colors, shapes, tiny details!",
      "Zoom in close. What is the smallest thing you can see?",
      "What is moving, and how does it move?",
    ],
  },
  {
    key: "hear",
    name: "Hear",
    tips: [
      "Close your eyes. What sounds are there?",
      "Is it loud or quiet? What makes the noise?",
      "Could someone say something? What would they say?",
    ],
  },
  {
    key: "feel",
    name: "Feel",
    tips: [
      "What does it feel like on your skin?",
      "Is it rough, smooth, sticky, cold or warm?",
      "What does your body do? Shiver, sweat, yawn?",
    ],
  },
  {
    key: "smell",
    name: "Smell",
    tips: [
      "Take a big sniff. What is in the air?",
      "Does it smell fresh, sweet, smoky or stinky?",
      "What does the smell remind you of?",
    ],
  },
  {
    key: "taste",
    name: "Taste",
    tips: [
      "Is there anything to taste? Sweet, salty, sour?",
      "What would it taste like if you took a bite?",
      "Does the air leave a taste on your tongue?",
    ],
  },
];

// Where each sense's sticker lands on the picture frame, and its tilt, in the
// order the student's senses come (see .paper-write__stickers)
const STICKER_TILTS = [-8, 7, -5, 6, -10];

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
            <p className="paper-write__sent-tell">{sent.sentence.tell}</p>
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
  const tell = editing ? editing.tell : day === undefined ? undefined : tellSentences[day - 1]?.tell;

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
  // repeats the Tell's telling word
  const found = senseWords(text);
  const used = SENSES.filter(({ key }) => found[key]);
  const tellWord = repeatedTellWord(text, tell);
  const clear = words >= WORD_GOAL && used.length >= 2 && !tellWord;

  // What Scribbles says. It changes when the sentence reaches a new stage,
  // not with every letter, so a screen reader isn't talked over.
  const coach =
    sense && asking
      ? SENSES[sense.index].tips[sense.turn % SENSES[sense.index].tips.length]
      : editing?.toRedo && typed === null
      ? // A sentence sent back for another try, before any change
        "Let's make it even better. Tap a sense for an idea!"
      : tellWord
      ? `“${tellWord}” is the Tell word. Can you show it instead?`
      : words === 0
      ? "Tap a sense and I'll help you think!"
      : words < WORD_GOAL
      ? "It's getting clearer! Add a detail."
      : used.length === 0
      ? "I see shapes, but no details yet. What would you see or hear?"
      : used.length === 1
      ? "Ooh, getting there! Can you add a second sense?"
      : `I can picture it! You used ${used.length} senses.`;

  // Scribbles' picture of the sentence: the Tell's photo, foggy and gray
  // until the sentence has enough words and senses to see it clearly
  const image = day === undefined ? undefined : tellSentences[day - 1]?.image;
  const blur = tellWord ? 6 : Math.max(0, WORD_GOAL - words) * 1.2;
  const gray = found.see || used.length >= 2 ? 0 : used.length === 1 ? 0.5 : 1;

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
    setSaving(true);
    setProblem(null);
    // The server sets the rest itself: the day's Tell (from the same list),
    // and an edit goes back to waiting to be checked, with a new date
    const result = editing
      ? await dispatch(editSentences({ title: editing.title, show: text }))
      : // The Tell goes along only for an older backend; the server looks it up itself
        await dispatch(createSentence({ title: "day" + day, show: text, tell }));
    setSaving(false);
    if (result.kind === "saved") {
      dispatch(fetchUser());
      // As the server saved it (trimmed), with the Tell it stored
      setSent({ sentence: { ...result.sentence, tell: result.sentence.tell ?? tell }, again: false });
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
        <ol className="paper-write__steps" aria-label="Steps">
          <li aria-current="step">1 · Write it</li>
          <li>2 · Scribbles checks</li>
          <li>3 · Join the gallery</li>
        </ol>
      </div>

      <div className="paper-stack">
        <form className="paper-stack__card paper-write__card" onSubmit={send}>
          <div className="paper-write__head">
            <h1 className="paper-write__tell">
              <span className="paper-status paper-status--retry">
                {editing ? (day ? `Sentence ${day} · Tell` : "Sentence · Tell") : "Your next Tell"}
              </span>
              <span className="paper-write__sentence">{tell}</span>
            </h1>

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

          {/* Scribbles' picture of the sentence, with a sticker for each
              sense it uses, and what he thinks of it */}
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
                    style={{ filter: `blur(${blur.toFixed(1)}px) grayscale(${gray})` }}
                  />
                )}
              </div>
              <div className="paper-write__stickers" aria-hidden>
                {used.map(({ key }, place) => (
                  <SenseSticker key={key} word={found[key]!} sense={key} tilt={STICKER_TILTS[place]} />
                ))}
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

          <div className="paper-write__ideas">
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
