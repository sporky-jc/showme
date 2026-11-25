import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import { putBarAway } from "./bottomBar";
import FilmPlayer from "./FilmPlayer";
import { WELCOME_FILM } from "../films";
import { popUpKeys } from "./popUpKeys";

// "Watch how it works" on the Welcome page: opens the Welcome film in a
// pop-up, with the way to sign in under it. The film still waits for its
// own play button. It's a dialog, like a refresher: the keyboard starts on
// its heading and stays inside it, Esc or Close shuts it, and the keyboard
// goes back to the button that opened it.
function WelcomeFilm({ onSignIn }: { onSignIn: () => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);

  // Before the pop-up is drawn (see bottomBar.ts)
  useLayoutEffect(() => {
    if (!open) return;
    putBarAway("welcome-film", true);
    return () => putBarAway("welcome-film", false);
  }, [open]);

  const close = () => {
    setOpen(false);
    // Once the pop-up is gone
    setTimeout(() => button.current?.focus());
  };

  // Esc shuts it; Tab and Shift+Tab go round inside it
  const onKeyDown = (event: React.KeyboardEvent) =>
    popUpKeys(event, dialog.current, heading.current, close);

  return (
    <>
      <button
        type="button"
        ref={button}
        className="paper-btn paper-welcome__watch"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="paper-welcome__watch-mark" aria-hidden />
        Watch how it works
      </button>
      {open && (
        <div className="paper-refresher">
          <div
            ref={dialog}
            className="paper-refresher__box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-film-heading"
            onKeyDown={onKeyDown}
          >
            <div className="paper-refresher__top paper-welcome-film__top">
              <h2 id="welcome-film-heading" ref={heading} tabIndex={-1}>
                {WELCOME_FILM.title}
              </h2>
              <button type="button" className="paper-refresher__close" onClick={close}>
                Close
              </button>
            </div>
            <FilmPlayer film={WELCOME_FILM} />
            <div className="paper-welcome-film__next">
              <p>Ready to show it your way?</p>
              <button
                type="button"
                className="paper-btn paper-btn--action"
                onClick={() => {
                  setOpen(false);
                  onSignIn();
                }}
              >
                <span className="paper-welcome__g" aria-hidden>
                  G
                </span>
                Sign in with Google
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default WelcomeFilm;
