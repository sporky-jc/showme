import React, { useEffect, useRef, useState } from "react";
import FilmPlayer from "./FilmPlayer";
import Scribbles from "./Scribbles";
import type { Film } from "../films";
import type { Practice, Refresher as RefresherWords } from "../refreshers";

// A refresher pop-up: a minute's reminder of what a technique is, in five
// short steps (see refreshers.ts for the words). A wrong pick only says
// "Not quite" with the clue, and Next waits for the right one. Styled in
// src/theme/paper.css; every motion stops under reduced motion.
//
// A technique with a film (films.ts) offers it on the first step, where the
// Tell and Show example would be: the film teaches that same example. It
// only plays when its button is pressed. The written example then comes on
// the last step instead, as a reminder.
//
// It's a dialog: the keyboard starts on its heading and stays inside it,
// Esc or Close shuts it, and the page that opened it puts the keyboard back
// on its button (onClose).

const KINDS = ["meet", "spot", "finish", "check", "done"] as const;
type Kind = (typeof KINDS)[number];
const HEADINGS: Record<Exclude<Kind, "meet">, string> = {
  spot: "Spot it",
  finish: "Finish it",
  check: "Quick check",
  done: "You’ve got it!",
};

function Refresher({ words, film, onClose }: { words: RefresherWords; film?: Film; onClose: () => void }) {
  // Once the film is playing, the small Scribbles beside it steps aside
  // (he's in the film)
  const [watching, setWatching] = useState(false);
  const [step, setStep] = useState(0);
  // The choice picked on this step, if any
  const [picked, setPicked] = useState<number | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const kind: Kind = KINDS[step];
  const practice: Practice | null =
    kind === "spot" || kind === "finish" || kind === "check" ? words[kind] : null;
  const right = practice !== null && picked === practice.answer;
  const wrong = practice !== null && picked !== null && !right;
  const canGoOn = practice === null || right;

  // Each step starts with the keyboard (and a screen reader) on its heading
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const goTo = (next: number) => {
    setStep(next);
    setPicked(null);
    setWatching(false);
  };

  // Esc shuts it; Tab and Shift+Tab go round inside it
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const stops = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const at = document.activeElement;
    if (event.shiftKey && (at === first || at === heading.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && at === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const example = (
    <div className="paper-refresher__example">
      <p>
        <span className="paper-refresher__tell">Tell</span> {words.tell}
      </p>
      <p>
        <span className="paper-refresher__show">Show</span> {words.before}
        <mark>{words.phrase}</mark>
        {words.after}
      </p>
    </div>
  );

  return (
    <div className="paper-refresher">
      <div
        ref={dialog}
        className="paper-refresher__box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="refresher-heading"
        onKeyDown={onKeyDown}
      >
        <div className="paper-refresher__top">
          <span className="paper-refresher__step">
            Step {step + 1} of {KINDS.length}
          </span>
          <span className="paper-refresher__dots" aria-hidden>
            {KINDS.map((each, place) => (
              <span
                key={each}
                className={
                  place <= step ? "paper-refresher__dot paper-refresher__dot--done" : "paper-refresher__dot"
                }
              />
            ))}
          </span>
          <button type="button" className="paper-refresher__close" onClick={onClose}>
            Close
          </button>
        </div>

        {/* With a film on this step, phones have no room for the small
            Scribbles too (he's in the film's picture) */}
        <div
          className={
            film && kind === "meet" ? "paper-refresher__body paper-refresher__body--film" : "paper-refresher__body"
          }
        >
          {!watching && (
            <Scribbles
              mood={wrong ? "thinking" : right || kind === "done" ? "happy" : "idle"}
              size={84}
              decorative
            />
          )}
          <div className="paper-refresher__main">
            <h2 id="refresher-heading" ref={heading} tabIndex={-1}>
              {kind === "meet" ? words.ask : HEADINGS[kind]}
            </h2>

            {kind === "meet" && (
              <>
                <p className="paper-refresher__meaning">{words.meaning}</p>
                {film ? <FilmPlayer film={film} onStart={() => setWatching(true)} /> : example}
                <p className="paper-refresher__clue">Clue: {words.clue}</p>
              </>
            )}

            {practice && (
              <>
                <p className="paper-refresher__question">{practice.q}</p>
                {kind === "finish" && (
                  <p className="paper-refresher__start">
                    {words.finish.start} <span className="paper-refresher__blank" aria-hidden />
                  </p>
                )}
                <div
                  role="group"
                  aria-label={practice.q}
                  className={
                    kind === "spot" ? "paper-refresher__choices paper-refresher__choices--row" : "paper-refresher__choices"
                  }
                >
                  {practice.choices.map((choice, place) => {
                    const chosen = picked === place;
                    const good = chosen && place === practice.answer;
                    return (
                      <button
                        type="button"
                        key={choice}
                        aria-pressed={chosen}
                        className={
                          good
                            ? "paper-refresher__choice paper-refresher__choice--right"
                            : chosen
                              ? "paper-refresher__choice paper-refresher__choice--wrong"
                              : "paper-refresher__choice"
                        }
                        // Once it's right, the step is done
                        onClick={() => !right && setPicked(place)}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
                <p
                  role="status"
                  className={right ? "paper-refresher__said paper-refresher__said--right" : "paper-refresher__said"}
                >
                  {right ? practice.yes : wrong ? `Not quite. ${practice.hint}` : ""}
                </p>
              </>
            )}

            {kind === "done" && (
              <>
                <p className="paper-refresher__meaning">{words.meaning}</p>
                {film && example}
                <p className="paper-refresher__remember">Remember: {words.clue}</p>
                <p className="paper-refresher__next">Now try one in your sentence!</p>
              </>
            )}
          </div>
        </div>

        <div className="paper-refresher__foot">
          {step > 0 && kind !== "done" && (
            <button type="button" className="paper-refresher__back" onClick={() => goTo(step - 1)}>
              Back
            </button>
          )}
          {kind === "done" && (
            <button type="button" className="paper-refresher__back" onClick={() => goTo(0)}>
              See it again
            </button>
          )}
          <button
            type="button"
            className="paper-btn paper-btn--action paper-refresher__go"
            disabled={!canGoOn}
            onClick={() => (kind === "done" ? onClose() : goTo(step + 1))}
          >
            {kind === "meet" ? "Let’s try it" : kind === "done" ? "Start writing" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Refresher;
