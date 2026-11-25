import React, { useEffect, useRef, useState } from "react";
import Scribbles from "../components/Scribbles";
import WelcomeFilm from "../components/WelcomeFilm";
import { useOpenLogin } from "../components/loginPopup";
import { phonePhotoMedia } from "../config";
import examples from "../tellData";

// How long each half of an example stays up while they play by themselves:
// its Tell sentence, then its Show sentence, then the next example. One the
// visitor picked stays up longer, so they can read it.
const TURN_EVERY_MS = 3500;
const AFTER_A_PICK_MS = 8000;

const wantsLessMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// The Show sentence comes in a few words at a time, after the brush has
// passed. Screen readers get it whole.
function ShowWords({ sentence }: { sentence: string }) {
  // Each word with where it starts in the sentence, which names it
  const words = sentence.split(" ").reduce<{ word: string; at: number; order: number }[]>(
    (list, word) => {
      const last = list[list.length - 1];
      return [...list, { word, at: last ? last.at + last.word.length + 1 : 0, order: list.length }];
    },
    []
  );
  return (
    <>
      <span className="visually-hidden">{sentence}</span>
      <span aria-hidden="true">
        {words.map(({ word, at, order }) => (
          <React.Fragment key={at}>
            {order > 0 && " "}
            <span className="paper-welcome__word" style={{ "--i": order } as React.CSSProperties}>
              {word}
            </span>
          </React.Fragment>
        ))}
      </span>
    </>
  );
}

// The first screen for someone who isn't signed in: what Show ME is, a way to
// sign in, and the same sentence told and then shown.
function Welcome() {
  const openLogin = useOpenLogin();

  // Which example is up, and which half of it
  const [index, setIndex] = useState(0);
  const [showing, setShowing] = useState(false);
  // The examples turn by themselves, like a slideshow. They wait while the
  // mouse or the keyboard is on them, and a little longer after the visitor
  // picks one. Someone who asked their device for less motion still gets the
  // slideshow (without the fades, see paper.css) and a button to pause it.
  const [lessMotion] = useState(wantsLessMotion);
  const [paused, setPaused] = useState(false);
  const [resting, setResting] = useState(false);
  const [picked, setPicked] = useState(false);
  const playing = !paused && !resting;
  // The other examples' photos wait for the first one, the main thing on
  // this screen, instead of sharing the connection with it
  const [firstPhotoDone, setFirstPhotoDone] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(
      () => {
        if (showing) setIndex((index + 1) % examples.length);
        setShowing(!showing);
        setPicked(false);
      },
      picked ? AFTER_A_PICK_MS : TURN_EVERY_MS
    );
    return () => clearTimeout(timer);
  }, [playing, picked, showing, index]);

  // Once the first photo is in (or the first example has been left before
  // it finished), fetch the others, so changing example doesn't show an
  // empty frame
  const fetchTheRest = firstPhotoDone || index !== 0;
  const fetched = useRef(false);
  useEffect(() => {
    if (!fetchTheRest || fetched.current) return;
    fetched.current = true;
    const onPhone = window.matchMedia?.(phonePhotoMedia).matches ?? false;
    examples.slice(1).forEach((example) => {
      new Image().src = onPhone ? example.phonePicture : example.picture;
    });
  }, [fetchTheRest]);

  const example = examples[index];
  const pick = (next: number, show: boolean) => {
    setPicked(true);
    setIndex(next);
    setShowing(show);
  };
  // Only a real mouse rests on the examples: a finger's tap also counts as
  // "entering", but never leaves, which would stop them for good. The same
  // goes for the keyboard: a tapped button keeps the focus without showing
  // it, so only focus the visitor can see counts.
  const mouseOnly = (rest: boolean) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse") setResting(rest);
  };
  const keyboardFocus = (event: React.FocusEvent) => {
    if ((event.target as Element).matches(":focus-visible")) setResting(true);
  };
  const photoDone = index === 0 ? () => setFirstPhotoDone(true) : undefined;

  return (
    <div className="paper-welcome">
      <section className="paper-welcome__pitch">
        <h1 className="paper-welcome__title">
          Don't just <span className="paper-welcome__tell">tell</span> it.{" "}
          <span className="paper-welcome__show">Show</span> it!
        </h1>
        {/* On a phone this comes last, under the example and the buttons
            (paper.css): the picture says it first */}
        <p className="paper-welcome__lead">
          Write yours. When Scribbles says yes, it joins the gallery.
        </p>
        <button
          type="button"
          className="paper-btn paper-btn--action paper-welcome__signin"
          onClick={openLogin}
        >
          <span className="paper-welcome__g" aria-hidden>
            G
          </span>
          Sign in with Google
        </button>
        <WelcomeFilm onSignIn={openLogin} />
      </section>

      <section
        className="paper-welcome__examples"
        aria-label="Tell versus Show examples"
        onPointerEnter={mouseOnly(true)}
        onPointerLeave={mouseOnly(false)}
        onFocus={keyboardFocus}
        onBlur={() => setResting(false)}
      >
        <div className="paper-stack">
          <div className="paper-stack__card paper-welcome__card">
            <div className="paper-welcome__photo">
              {/* Phones held upright get the phone-shaped copy, which
                  index.html has usually started downloading already
                  (vite.config.ts) */}
              <picture>
                <source media={phonePhotoMedia} srcSet={example.phonePicture} />
                <img
                  // A new <img> for each example, so the last photo never
                  // shows under the next example's words while it downloads
                  key={example.key}
                  className={showing ? undefined : "paper-welcome__faded"}
                  src={example.picture}
                  alt={example.alt}
                  fetchPriority={index === 0 ? "high" : undefined}
                  onLoad={photoDone}
                  onError={photoDone}
                />
              </picture>
              {/* Turning to Show: the photo is clear at once, and a gray
                  copy of it slides away with a coral brush bar on its edge,
                  so the color looks painted in. A new one for each Show, so
                  it plays each time; still under less motion (paper.css). */}
              {showing && (
                <span className="paper-welcome__wipe" key={example.key} aria-hidden="true">
                  <span className="paper-welcome__wipe-in">
                    <picture>
                      <source media={phonePhotoMedia} srcSet={example.phonePicture} />
                      <img className="paper-welcome__faded" src={example.picture} alt="" />
                    </picture>
                  </span>
                  <span className="paper-welcome__brush" />
                </span>
              )}
            </div>
            {/* Tell or Show, and Pause. Under the photo on a phone, so they
                don't cover it; on its top corners on wider screens
                (paper.css). */}
            <div className="paper-welcome__controls">
              <div className="paper-toggle" role="group" aria-label="Tell or show">
                <button
                  type="button"
                  aria-pressed={!showing}
                  onClick={() => pick(index, false)}
                >
                  Tell
                </button>
                <button
                  type="button"
                  aria-pressed={showing}
                  onClick={() => pick(index, true)}
                >
                  Show
                </button>
              </div>
              {lessMotion && (
                <button
                  type="button"
                  className="paper-welcome__pause"
                  aria-pressed={paused}
                  onClick={() => setPaused(!paused)}
                >
                  {paused ? "Play" : "Pause"}
                </button>
              )}
            </div>
            {/* Read out when the visitor changes it, not while it plays by
                itself. Already "polite" once the mouse or keyboard is on
                the examples, before the press that changes the words. */}
            <div
              className="paper-welcome__words"
              aria-live={playing && !picked ? "off" : "polite"}
            >
              <span
                className={`paper-status ${
                  showing ? "paper-status--done" : "paper-status--retry"
                }`}
              >
                {showing ? "Show" : "Tell"}
              </span>
              <p
                className={
                  showing ? "paper-welcome__sentence" : "paper-welcome__sentence paper-welcome__sentence--tell"
                }
              >
                {showing ? <ShowWords key={example.key} sentence={example.show} /> : example.tell}
              </p>
            </div>
          </div>
          <div className="paper-welcome__scribbles">
            <Scribbles mood={showing ? "happy" : "idle"} size={96} decorative />
            <p className="paper-bubble">Tap Show and watch the words come alive!</p>
          </div>
        </div>

        <div className="paper-welcome__picker" role="group" aria-label="More examples">
          {examples.map((other, i) => (
            <button
              type="button"
              key={other.key}
              aria-pressed={i === index}
              onClick={() => pick(i, false)}
            >
              {/* The same file the big photo uses on this screen, so it is
                  only downloaded once */}
              <picture>
                <source media={phonePhotoMedia} srcSet={other.phonePicture} />
                <img src={other.picture} alt="" loading="lazy" />
              </picture>
              <span>{other.short}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Welcome;
