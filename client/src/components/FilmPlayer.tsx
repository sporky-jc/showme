import React, { useEffect, useRef, useState } from "react";
import type { Film } from "../films";

// An explainer film (see films.ts). It never plays by itself: it starts as
// its picture with a play button, and nothing is downloaded until that is
// pressed. Then the video takes the picture's place, with its captions on
// and the browser's own controls (pause, sound, captions, full screen), and
// the keyboard moves onto it. Styled in src/theme/paper.css.
function FilmPlayer({ film, onStart }: { film: Film; onStart?: () => void }) {
  const [started, setStarted] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (started) video.current?.focus();
  }, [started]);

  if (!started) {
    return (
      <button
        type="button"
        className="paper-film paper-film--poster"
        onClick={() => {
          setStarted(true);
          onStart?.();
        }}
      >
        <img src={film.poster} alt="" width={1280} height={720} />
        <span className="paper-film__play" aria-hidden />
        <span className="paper-film__label">
          Watch the film <span className="paper-film__time">· {film.seconds} seconds</span>
        </span>
      </button>
    );
  }

  return (
    <video
      ref={video}
      className="paper-film paper-film--video"
      src={film.video}
      poster={film.poster}
      aria-label={film.title}
      // So the keyboard can land on it in every browser
      tabIndex={0}
      controls
      autoPlay
      playsInline
      preload="none"
    >
      <track kind="captions" src={film.captions} srcLang="en" label="English" default />
    </video>
  );
}

export default FilmPlayer;
