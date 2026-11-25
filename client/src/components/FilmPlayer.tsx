import React, { useEffect, useRef, useState } from "react";
import type { Film } from "../films";

// An explainer film (see films.ts). It never plays by itself: it starts as
// its picture with a play button, and the video isn't downloaded until that
// is pressed (preload="none"). The press itself starts it, because phones
// only let a video with sound start straight from a press, not a moment
// later. Then the browser's own controls show (pause, sound, full screen)
// and the keyboard moves onto the video. If the video can't play, a link
// opens it by itself. Styled in src/theme/paper.css.
//
// No captions of ours: the viewer's device shows its own, from its player.
// (And no <track> element: iPhones won't load a video that has one.)
//
// On a phone the picture in the page is small, so while the film plays it
// fills the screen, in real full screen so the browser's own bars are gone:
// - An iPhone can only make a video full screen, in its own player, and does
//   that by itself when a video without `playsinline` plays (`ownPlayer`).
// - Other phones make our set full screen (`big`): the video and a button
//   back to the page. If the browser says no, the set still covers the page.
//
// On the Films page, where there are many: `about` names the film in the
// play button ("Watch the film: Simile"), and starting one film stops the
// others.
interface Props {
  film: Film;
  onStart?: () => void;
  about?: string;
}

// A phone, held either way up
const onAPhone = () => window.matchMedia?.("(max-width: 640px), (max-height: 500px)").matches ?? false;

// Safari (every browser on an iPhone is Safari inside). An iPhone says it
// can make a part of the page full screen but doesn't do it, so there the
// film goes to the phone's own player. Only Safari has this property.
const ownPlayer = () => "webkitSupportsPresentationMode" in HTMLVideoElement.prototype;

function FilmPlayer({ film, onStart, about }: Props) {
  const [started, setStarted] = useState(false);
  const [broken, setBroken] = useState(false);
  const [big, setBig] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const set = useRef<HTMLDivElement>(null);

  // The page under the big view stays where it is; full screen ends with it
  useEffect(() => {
    if (!big) return;
    document.documentElement.classList.add("paper-film-open");
    const left = () => {
      if (!document.fullscreenElement) setBig(false);
    };
    document.addEventListener("fullscreenchange", left);
    return () => {
      document.removeEventListener("fullscreenchange", left);
      document.documentElement.classList.remove("paper-film-open");
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [big]);

  const grow = () => {
    // An iPhone goes to its own player by itself
    if (ownPlayer() || big || !onAPhone()) return;
    setBig(true);
    // Needs a press; if the browser says no, the set still covers the page
    void set.current?.requestFullscreen?.().catch(() => undefined);
  };

  const start = () => {
    const player = video.current;
    // Some browsers answer with a promise that fails if they won't play
    // yet; the controls are showing by then, so the viewer can press play
    void player?.play()?.catch(() => undefined);
    setStarted(true);
    grow();
    onStart?.();
    player?.focus();
  };

  return (
    <div
      ref={set}
      className={big ? "paper-film-set paper-film-set--big" : "paper-film-set"}
      onKeyDown={(event) => {
        // Esc leaves the big view first, before any pop-up around it
        if (!big || event.key !== "Escape") return;
        event.stopPropagation();
        setBig(false);
      }}
    >
      {big && (
        <button type="button" className="paper-film__back" onClick={() => setBig(false)}>
          Back to the page
        </button>
      )}
      <div className="paper-film">
        <video
          ref={video}
          className="paper-film__video"
          poster={film.poster}
          aria-label={film.title}
          controls={started}
          playsInline={!ownPlayer()}
          preload="none"
          // So the keyboard can land on it in every browser, once it's playing
          tabIndex={started ? 0 : -1}
          onPlay={(event) => {
            grow();
            // One film at a time
            const mine = event.currentTarget;
            document.querySelectorAll("video").forEach((other) => {
              if (other !== mine) other.pause();
            });
          }}
          onEnded={(event) => {
            setBig(false);
            (event.currentTarget as HTMLVideoElement & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
          }}
        >
          <source src={film.video} type="video/mp4" onError={() => setBroken(true)} />
        </video>
        {!started && (
          <button
            type="button"
            className="paper-film__start"
            aria-label={about ? `Watch the film: ${about}, ${film.seconds} seconds` : undefined}
            onClick={start}
          >
            <span className="paper-film__play" aria-hidden />
            <span className="paper-film__label">
              Watch the film <span className="paper-film__time">· {film.seconds} seconds</span>
            </span>
          </button>
        )}
        {broken && (
          <p className="paper-film__broken">
            The film can’t play here. <a href={film.video}>Open the film</a>
          </p>
        )}
      </div>
    </div>
  );
}

export default FilmPlayer;
