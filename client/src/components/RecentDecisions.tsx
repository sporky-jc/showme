import { useEffect, useRef, useState } from "react";
import type { AxiosError } from "axios";
import * as api from "../api";
import type { QueueSentence, SentenceWithAuthor } from "../api/types";

// Some accounts have no last name. The teacher sees the whole name, as on
// the queue's cards.
const nameOf = ({ author }: SentenceWithAuthor) =>
  author.lastName ? `${author.firstName} ${author.lastName}` : author.firstName;

// Under the Teacher page's queue: the sentences teachers approved or sent
// back most recently, each with the way to take that decision back. An
// approved one comes out of the gallery, a sent-back one stops asking the
// student to try again, and either way it goes back into the queue above to
// be decided again. Closed until the teacher opens it, so the page reads as
// before for everyone who doesn't need it (and asks the server nothing
// more), and it asks again each time it's opened, and after each decision
// made above (`refresh` changes), so it never offers an out-of-date one.
function RecentDecisions({
  refresh,
  onQueue,
  onSaid,
  saving,
  onSaving,
}: {
  refresh: number;
  // The queue as the server has it after a decision was taken back
  onQueue: (queue: QueueSentence[]) => void;
  // What just happened, for the page's one message to screen readers
  onSaid: (said: string) => void;
  // The sentence being saved, here or in the queue above: every button on
  // the page waits for it, so two changes can't cross
  saving: string | null;
  onSaving: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // null while it's being asked for
  const [decisions, setDecisions] = useState<SentenceWithAuthor[] | "failed" | null>(null);
  // Why the last undo didn't happen, if it didn't: it couldn't be saved, or
  // the sentence had changed or was already taken back ("stale")
  const [failed, setFailed] = useState<false | "failed" | "stale">(false);
  const toggle = useRef<HTMLButtonElement>(null);
  // Set when an undo has been saved, and used (once) right after the redraw
  // that turns the buttons back on: a turned-off button can't take focus
  const focusToggle = useRef(false);
  useEffect(() => {
    if (saving !== null || !focusToggle.current) return;
    focusToggle.current = false;
    toggle.current?.focus();
  });

  useEffect(() => {
    if (!open) return;
    let current = true;
    api
      .fetchRecentDecisions()
      .then(({ data }) => {
        if (current) setDecisions(Array.isArray(data) ? data : "failed");
      })
      .catch(() => {
        if (current) setDecisions("failed");
      });
    return () => {
      current = false;
    };
  }, [open, refresh]);

  async function undo(sentence: SentenceWithAuthor) {
    if (saving) return;
    onSaving(sentence._id);
    setFailed(false);
    const status = sentence.approved ? "approve" : "redo";
    try {
      const { data } = await api.undoDecision(status, sentence);
      setDecisions(data.decisions);
      onQueue(data.queue);
      onSaid(
        status === "approve"
          ? `Took ${nameOf(sentence)}'s sentence out of the gallery. It's waiting for you again.`
          : `${nameOf(sentence)}'s sentence isn't sent back any more. It's waiting for you again.`
      );
      // Its button is gone: the keyboard goes back to the list's button,
      // once the buttons are turned back on (see below)
      focusToggle.current = true;
    } catch (error) {
      const stale = (error as AxiosError).response?.status === 409;
      setFailed(stale ? "stale" : "failed");
      // The latest list, so the out-of-date entry doesn't stay to fail again
      if (stale) {
        try {
          setDecisions((await api.fetchRecentDecisions()).data);
        } catch {
          // keep the list shown
        }
      }
    }
    onSaving(null);
  }

  return (
    <section className="paper-review__recent">
      <button
        type="button"
        ref={toggle}
        className="paper-btn paper-review__cancel paper-review__recent-toggle"
        aria-expanded={open}
        disabled={saving !== null}
        onClick={() => {
          // Opening it shows "Loading" until the latest list arrives
          if (!open) setDecisions(null);
          setOpen(!open);
          setFailed(false);
        }}
      >
        Recent decisions
      </button>
      {open && (
        <>
          {failed && (
            <p className="paper-review__failed" role="alert">
              {failed === "stale"
                ? "This sentence changed or its decision was already taken back. Here's the latest."
                : "That didn't save. If the sentence is still here, press the button again."}
            </p>
          )}
          {decisions === null ? (
            <p>Loading the recent decisions…</p>
          ) : decisions === "failed" ? (
            <p role="alert">
              We couldn&apos;t load the recent decisions. Check your internet connection, then open
              them again.
            </p>
          ) : decisions.length === 0 ? (
            <p>No decisions yet.</p>
          ) : (
            <ol className="paper-review__decisions" aria-label="Recent decisions">
              {decisions.map((sentence) => {
                const name = nameOf(sentence);
                const label = sentence.approved ? "Take out of gallery" : "Undo send back";
                return (
                  <li className="paper-review__card" key={sentence._id}>
                    <div className="paper-review__who">
                      <h3>{name}</h3>
                      <span className="paper-review__waited">
                        {sentence.approved ? "In the gallery" : "Sent back"}
                      </span>
                    </div>
                    <p className="paper-review__show">{sentence.show}</p>
                    <div className="paper-review__decide">
                      <button
                        type="button"
                        className="paper-btn paper-review__cancel"
                        aria-label={
                          saving === sentence._id ? `Saving: ${name}'s sentence` : `${label}: ${name}'s sentence`
                        }
                        disabled={saving !== null}
                        onClick={() => undo(sentence)}
                      >
                        {saving === sentence._id ? "Saving…" : label}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

export default RecentDecisions;
