import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import Scribbles from "../components/Scribbles";
import PageLoading from "../components/PageLoading";
import SignInPrompt from "../components/SignInPrompt";
import { useStudentData } from "../components/useStudentData";
import { createSentence, editSentences } from "../actions/usersentences";
import { fetchUser } from "../actions/user";
import type { AppDispatch, RootState } from "../reducers/types";

// The five senses, each with questions Scribbles asks to get a writer going.
// They are general on purpose: they work for any Tell sentence. Pressing a
// sense again asks its next question.
const SENSES = [
  {
    name: "See",
    tips: [
      "What would a camera catch? Colors, shapes, tiny details!",
      "Zoom in close. What is the smallest thing you can see?",
      "What is moving, and how does it move?",
    ],
  },
  {
    name: "Hear",
    tips: [
      "Close your eyes. What sounds are there?",
      "Is it loud or quiet? What makes the noise?",
      "Could someone say something? What would they say?",
    ],
  },
  {
    name: "Feel",
    tips: [
      "What does it feel like on your skin?",
      "Is it rough, smooth, sticky, cold or warm?",
      "What does your body do? Shiver, sweat, yawn?",
    ],
  },
  {
    name: "Smell",
    tips: [
      "Take a big sniff. What is in the air?",
      "Does it smell fresh, sweet, smoky or stinky?",
      "What does the smell remind you of?",
    ],
  },
  {
    name: "Taste",
    tips: [
      "Is there anything to taste? Sweet, salty, sour?",
      "What would it taste like if you took a bite?",
      "Does the air leave a taste on your tongue?",
    ],
  },
] as const;

// A sentence this long has room for a detail
const WORD_GOAL = 8;

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

// The Write page: today's Tell sentence and a big box to show it in, with
// Scribbles beside it. Also where a sentence is edited (/Write/<its id>).
// Once the server has the sentence, the page says Scribbles is checking it.
function WriteSentence({ id }: { id: string | undefined }) {
  const user = useSelector((state: RootState) => state.user);
  const tellSentences = useSelector((state: RootState) => state.tellsentences);
  const userSentences = useSelector((state: RootState) => state.usersentences);
  const dispatch = useDispatch<AppDispatch>();
  const signedIn = Object.keys(user).length !== 0;

  const { loaded, retry } = useStudentData(signedIn);

  // What the student is typing (null until they type: an edit starts from
  // the sentence as it is), the sense Scribbles is asking about, whether the
  // server is being asked, whether it failed, and the sentence it accepted.
  const [typed, setTyped] = useState<string | null>(null);
  const [sense, setSense] = useState<{ index: number; turn: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState<{ tell: string; show: string } | null>(null);

  // Once sent, the page changes under the reader: move them to its heading
  const sentHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) sentHeading.current?.focus();
  }, [sent]);

  if (!signedIn) {
    return (
      <div className="paper-write">
        <SignInPrompt>Sign in to write your own sentences.</SignInPrompt>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="paper-write paper-write--sent">
        <div className="paper-write__checking">
          <Scribbles mood="thinking" prop="note" size={150} decorative />
          <div>
            <h1 ref={sentHeading} tabIndex={-1}>
              Scribbles is checking!
            </h1>
            <p className="paper-write__later">
              Come back later! Once your teacher approves it, it will appear
              in the gallery.
            </p>
          </div>
        </div>
        <div className="paper-stack">
          <div className="paper-stack__card paper-write__sent-card">
            <span className="paper-status paper-status--turn">Scribbles is checking…</span>
            <p className="paper-write__sent-tell">{sent.tell}</p>
            <p className="paper-write__sent-show">{sent.show}</p>
          </div>
        </div>
        <div className="paper-write__next">
          <Link to="/" className="paper-btn paper-btn--action">
            Back to today
          </Link>
          <Link to="/MyPage" className="paper-btn">
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

  // Which sentence this is: the one being edited, or the next new one. A
  // sentence's day is its place in the student's list.
  const editIndex = id ? userSentences.findIndex((sentence) => sentence._id === id) : -1;
  const editing = editIndex >= 0 ? userSentences[editIndex] : null;
  const day = editing ? editIndex + 1 : userSentences.length + 1;
  const tell = tellSentences[day - 1]?.tell;

  if (id && !editing) {
    return (
      <div className="paper-write">
        <div className="page-message">
          <p>We couldn&apos;t find that sentence.</p>
          <Link to="/MyPage" className="paper-btn paper-btn--action">
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
        <div className="page-message">
          <p>You showed every sentence! Come back later for more.</p>
          <Link to="/Collections" className="paper-btn paper-btn--action">
            See the class gallery
          </Link>
        </div>
      </div>
    );
  }

  const text = typed ?? editing?.show ?? "";
  const words = countWords(text);
  const cheer =
    words === 0
      ? "Don't just tell me. Show me!"
      : words < WORD_GOAL
      ? "Keep going, add a detail!"
      : "Nice and vivid!";
  const tip = sense
    ? SENSES[sense.index].tips[sense.turn % SENSES[sense.index].tips.length]
    : editing?.toRedo
    ? "Let's make it even better. Tap a sense for an idea!"
    : "Tap a sense and I'll help you think!";

  const askAbout = (index: number) =>
    setSense((now) => ({ index, turn: now?.index === index ? now.turn + 1 : 0 }));

  // Send the sentence to the server. The words stay in the box until it
  // answers, so nothing is lost if it can't be reached; the button is off
  // meanwhile, so a double press can't send the same day twice.
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !tell || text.trim() === "") return;
    setSaving(true);
    setFailed(false);
    // The server sets the rest itself: an edit goes back to waiting to be
    // checked, with a new date
    const saved = editing
      ? await dispatch(editSentences({ title: editing.title, show: text }))
      : await dispatch(createSentence({ title: "day" + day, tell, show: text }));
    setSaving(false);
    if (!saved) {
      setFailed(true);
      return;
    }
    dispatch(fetchUser());
    setSent({ tell, show: text });
  }

  return (
    <div className="paper-write">
      <div className="paper-write__top">
        <Link to="/" className="paper-write__back">
          <span aria-hidden>←</span> Back to today
        </Link>
        <ol className="paper-write__steps" aria-label="Steps">
          <li aria-current="step">1 · Write it</li>
          <li>2 · Scribbles checks</li>
          <li>3 · Join the gallery</li>
        </ol>
      </div>

      <div className="paper-write__desk">
        <div className="paper-stack">
          <form className="paper-stack__card paper-write__card" onSubmit={send}>
            <h1 className="paper-write__tell">
              <span className="paper-status paper-status--retry">
                {editing ? `Day ${day} · Tell` : "Today's Tell"}
              </span>
              <span className="paper-write__sentence">{tell}</span>
            </h1>

            {editing?.approved && (
              <p className="paper-write__notice">
                This one is in the gallery. If you change it, your teacher
                checks it again first.
              </p>
            )}

            <div className="paper-write__senses" role="group" aria-label="Senses">
              {SENSES.map(({ name }, index) => (
                <button
                  type="button"
                  key={name}
                  aria-pressed={sense?.index === index}
                  onClick={() => askAbout(index)}
                >
                  {name}
                </button>
              ))}
            </div>

            <label className="paper-write__label" htmlFor="show-sentence">
              Now show it
            </label>
            <textarea
              id="show-sentence"
              className="paper-write__box"
              rows={5}
              value={text}
              placeholder="Don't just tell me, instead SHOW ME!"
              aria-describedby="show-count"
              onChange={(event) => setTyped(event.target.value)}
            />

            <div className="paper-write__foot">
              <p id="show-count" className="paper-write__count">
                <strong>
                  {words} {words === 1 ? "word" : "words"}
                </strong>{" "}
                · {cheer}
              </p>
              <button
                type="submit"
                className="paper-btn paper-btn--action paper-write__send"
                disabled={saving || text.trim() === ""}
              >
                {saving ? "Sending…" : "Ask Scribbles"}
              </button>
            </div>

            {failed && (
              <p className="paper-write__failed" role="alert">
                We couldn&apos;t send your sentence. Check your internet
                connection, then press Ask Scribbles again.
              </p>
            )}
          </form>
        </div>

        <div className="paper-write__coach">
          {/* He cheers once the sentence has room for a detail */}
          <Scribbles mood={words >= WORD_GOAL ? "happy" : "idle"} prop="note" size={130} decorative />
          <p className="paper-bubble" aria-live="polite">
            {tip}
          </p>
        </div>
      </div>
    </div>
  );
}

// With an id in the address, that sentence is being edited. Each sentence
// gets a page of its own (the key), so nothing typed for one carries over to
// another.
function Write() {
  const { id } = useParams();
  return <WriteSentence key={id ?? "new"} id={id} />;
}

export default Write;
