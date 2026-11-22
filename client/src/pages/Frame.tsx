import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import Cards from "../components/Cards";
import PageLoading from "../components/PageLoading";
import Scribbles from "../components/Scribbles";
import SignInPrompt from "../components/SignInPrompt";
import { useStudentData } from "../components/useStudentData";
import { pickFrame, type SaveResult } from "../actions/usersentences";
import { DEFAULT_FRAME, FRAME_IDS, FRAME_NAMES, frameStyle } from "../frames";
import type { Frame as FrameId } from "../api/types";
import type { AppDispatch, RootState } from "../reducers/types";

// What to say when a pick wasn't saved
const problemWith = (result: SaveResult) => {
  switch (result.kind) {
    case "too-many":
      return result.message ?? "Too many tries. Wait a minute, then try again.";
    case "missing":
      return "This sentence isn't in the gallery right now, so it can't get a frame.";
    case "unreachable":
      return "We couldn't save your frame. Check your internet connection, then try again.";
    default:
      return "We couldn't save your frame. Try again.";
  }
};

// After a sentence is approved, its author picks the color of its picture's
// frame in the gallery, seeing the card as everyone will (see frames.ts).
function Frame() {
  const { id } = useParams();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const user = useSelector((state: RootState) => state.user);
  const userSentences = useSelector((state: RootState) => state.usersentences);
  const signedIn = Object.keys(user).length !== 0;
  const { loaded, retry } = useStudentData();
  const sentence = userSentences.find((mine) => mine._id === id);

  // The student's pick so far: their saved frame until they choose another
  const [picked, setPicked] = useState<FrameId | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="paper-frame">
        <h1 className="visually-hidden">Pick a frame</h1>
        <SignInPrompt>Sign in to pick a frame for your sentence.</SignInPrompt>
      </div>
    );
  }
  if (loaded === "loading") return <PageLoading />;
  if (loaded === "failed") {
    return (
      <div className="paper-frame">
        <h1 className="visually-hidden">Pick a frame</h1>
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
  // Only a sentence in the gallery has a frame to pick
  if (!sentence?.approved) {
    return (
      <div className="paper-frame">
        <h1>Pick a frame</h1>
        <p className="page-message">
          This sentence isn&apos;t in the gallery yet. Once Scribbles approves
          it, you can pick its frame.
        </p>
        <Link to="/MySentences" className="paper-btn paper-btn--action">
          Back to My sentences
        </Link>
      </div>
    );
  }

  const frame = picked ?? sentence.look?.frame ?? DEFAULT_FRAME;
  // The card as the gallery will show it, with the frame being tried
  const preview = {
    ...sentence,
    look: { frame },
    author: { firstName: user.firstName ?? "", lastName: user.lastName },
  };

  const save = async () => {
    setSaving(true);
    setProblem(null);
    const result = await dispatch(pickFrame(sentence._id, frame));
    setSaving(false);
    if (result.kind === "saved") navigate("/Gallery");
    else setProblem(problemWith(result));
  };

  return (
    <div className="paper-frame">
      <div className="paper-frame__top">
        <Scribbles mood="happy" size={110} />
        <div>
          <span className="paper-status paper-status--done">In the gallery</span>
          <h1>Pick a frame</h1>
          <p className="paper-frame__hint">
            Pick a color for your picture&apos;s frame. Everyone will see it in the gallery.
          </p>
        </div>
      </div>

      <div className="paper-frame__body">
        <div className="paper-frame__pick">
          <fieldset className="paper-frame__colors">
            <legend>Frame color</legend>
            {FRAME_IDS.map((id) => (
              <label key={id} className="paper-frame__color" style={frameStyle(id)}>
                <input
                  type="radio"
                  name="frame"
                  value={id}
                  checked={frame === id}
                  onChange={() => setPicked(id)}
                />
                <span className="paper-frame__swatch" aria-hidden />
                {FRAME_NAMES[id]}
              </label>
            ))}
          </fieldset>

          {problem && (
            <p className="paper-frame__problem" role="alert">
              {problem}
            </p>
          )}
          <div className="paper-frame__actions">
            <button
              type="button"
              className="paper-btn paper-btn--action"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving…" : "Hang it in the gallery"}
            </button>
            <Link to="/MySentences" className="paper-frame__back">
              Back to My sentences
            </Link>
          </div>
        </div>

        <section className="paper-frame__preview" aria-labelledby="frame-preview">
          <h2 id="frame-preview">How it looks in the gallery</h2>
          <Cards displaySentences={[preview]} />
        </section>
      </div>
    </div>
  );
}

export default Frame;
