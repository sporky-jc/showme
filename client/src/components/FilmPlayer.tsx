import React, { useRef, useState } from "react";
import { addCaptions } from "../captions";
import type { Film } from "../films";

// An explainer film (see films.ts). It never plays by itself: it starts as
// its picture with a play button, and the video isn't downloaded until that
// is pressed (preload="none"). The press itself starts it, because phones
// only let a video with sound start straight from a press, not a moment
// later. Then the browser's own controls show (pause, sound, captions, full
// screen) and the keyboard moves onto the video. Captions are there but off
// until the viewer turns them on; they are added by addCaptions, not with a
// <track> element, because iPhones won't load a video that has one. If the
// video can't play, a link opens it by itself. Styled in src/theme/paper.css.
function FilmPlayer({ film, onStart }: { film: Film; onStart?: () => void }) {
  const [started, setStarted] = useState(false);
  const [broken, setBroken] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const start = () => {
    const player = video.current;
    // Some browsers answer with a promise that fails if they won't play
    // yet; the controls are showing by then, so the viewer can press play
    void player?.play()?.catch(() => undefined);
    setStarted(true);
    onStart?.();
    player?.focus();
    if (player) void addCaptions(player, film.captions);
  };

  return (
    <div className="paper-film">
      <video
        ref={video}
        className="paper-film__video"
        poster={film.poster}
        aria-label={film.title}
        controls={started}
        playsInline
        preload="none"
        // So the keyboard can land on it in every browser, once it's playing
        tabIndex={started ? 0 : -1}
      >
        <source src={film.video} type="video/mp4" onError={() => setBroken(true)} />
      </video>
      {!started && (
        <button type="button" className="paper-film__start" onClick={start}>
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
  );
}

export default FilmPlayer;
