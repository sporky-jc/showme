import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AxiosError } from "axios";
import * as api from "../api";
import type { ReviewerStatus } from "../api/types";

// Only what the contract says (backend/contract/api.ts): anything else, such
// as a server from before this switch answering with something it isn't,
// hides the panel
const isStatus = (data: unknown): data is ReviewerStatus => {
  const status = data as Partial<ReviewerStatus> | null;
  return (
    typeof status === "object" &&
    status !== null &&
    (status.mode === "off" || status.mode === "suggest") &&
    typeof status.paused === "boolean"
  );
};

// When Scribbles was paused, in this teacher's own words for dates
const when = (pausedAt: string) =>
  new Date(pausedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// Near the top of the Teacher page: whether Scribbles (the AI reviewer,
// backend/reviewer/) is reading new sentences, and the big red button that
// pauses him at once, with no deploy (backend/models/reviewerSwitch.ts).
// Pausing asks first; turning him back on doesn't. His notes already on the
// cards stay as they are: they're only suggestions, and the teacher decides.
// With "off" (set by the deploy, as on the real site until Scribbles has
// passed his fair test) there's nothing to switch, so nothing shows: teachers
// first see the panel once he's actually running. Nothing shows either if
// the server doesn't answer how he is (a pull request's preview uses the
// staging backend, which may not have the switch yet).
function ReviewerSwitch({ onSaid }: { onSaid: (said: string) => void }) {
  const [status, setStatus] = useState<ReviewerStatus | null>(null);
  // "Pause Scribbles?" is open, a change is being saved, and why the last
  // one didn't happen
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  // Where the keyboard goes after the next redraw: the confirm step's first
  // button when it opens, the switch's button when it closes or saves
  const focusNext = useRef<"confirm" | "switch" | null>(null);
  // A layout effect, so the keyboard moves as soon as the page is redrawn,
  // before anything else can run (a plain effect may wait a moment)
  useLayoutEffect(() => {
    const target = focusNext.current;
    if (!target || saving) return;
    focusNext.current = null;
    panel.current?.querySelector<HTMLButtonElement>(`[data-focus="${target}"]`)?.focus();
  });

  useEffect(() => {
    let current = true;
    api
      .fetchReviewerStatus()
      .then(({ data }) => {
        if (current && isStatus(data)) setStatus(data);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  if (!status || status.mode === "off") return null;

  const change = async (paused: boolean) => {
    setSaving(true);
    setFailed(null);
    // Back to the switch's button once it's saved
    focusNext.current = "switch";
    try {
      const { data } = await api.setReviewerPaused(paused);
      if (!isStatus(data)) throw new Error("Unexpected answer");
      setStatus(data);
      setConfirming(false);
      onSaid(data.paused ? "Scribbles is paused." : "Scribbles is back on.");
    } catch (error) {
      // A pause that didn't save leaves "Pause Scribbles?" open, to press again
      if (paused) focusNext.current = "confirm";
      // The server's reason when it refused (a test account may not pause
      // him), or the usual one
      const message = (error as AxiosError<{ message?: string }>).response?.data?.message;
      setFailed(
        (error as AxiosError).response?.status === 403 && message
          ? message
          : "That didn't change. Check your internet connection, then press the button again."
      );
    }
    setSaving(false);
  };

  return (
    <section
      ref={panel}
      className={status.paused ? "paper-review__switch paper-review__switch--paused" : "paper-review__switch"}
      aria-label="Scribbles"
    >
      <p className="paper-review__switch-state">
        {status.paused ? (
          <>
            <strong>Scribbles: paused.</strong> He isn&apos;t reading new sentences
            {status.pausedAt ? ` (since ${when(status.pausedAt)})` : ""}.
          </>
        ) : (
          <>
            <strong>Scribbles: on.</strong> He reads new sentences first.
          </>
        )}
      </p>
      {failed && (
        <p className="paper-review__failed" role="alert">
          {failed}
        </p>
      )}
      {confirming ? (
        <div className="paper-review__switch-confirm" role="group" aria-label="Pause Scribbles?">
          <p>
            Pause Scribbles? He stops reading new sentences until you turn him back on, for every
            teacher. His notes already on the cards stay.
          </p>
          <div className="paper-review__decide">
            <button
              type="button"
              className="paper-btn paper-review__switch-pause"
              data-focus="confirm"
              disabled={saving}
              onClick={() => change(true)}
            >
              {saving ? "Saving…" : "Yes, pause Scribbles"}
            </button>
            <button
              type="button"
              className="paper-btn"
              disabled={saving}
              onClick={() => {
                focusNext.current = "switch";
                setConfirming(false);
              }}
            >
              Keep Scribbles on
            </button>
          </div>
        </div>
      ) : status.paused ? (
        <button
          type="button"
          className="paper-btn paper-btn--action"
          data-focus="switch"
          disabled={saving}
          onClick={() => change(false)}
        >
          {saving ? "Saving…" : "Turn Scribbles back on"}
        </button>
      ) : (
        <button
          type="button"
          className="paper-btn paper-review__switch-pause"
          data-focus="switch"
          onClick={() => {
            focusNext.current = "confirm";
            setFailed(null);
            setConfirming(true);
          }}
        >
          Pause Scribbles
        </button>
      )}
    </section>
  );
}

export default ReviewerSwitch;
