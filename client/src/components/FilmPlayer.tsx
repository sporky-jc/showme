import React, { useRef, useState } from "react";
import { lineAt, loadCaptions } from "../captions";
import type { CaptionLine } from "../captions";
import type { Film } from "../films";

// An explainer film (see films.ts). It never plays by itself: it starts as
// its picture with a play button, and the video isn't downloaded until that
// is pressed (preload="none"). The press itself starts it, because phones
// only let a video with sound start straight from a press, not a moment
// later. Then the browser's own controls show (pause, sound, full screen)
// and the keyboard moves onto the video.
//
// Captions are ours: a Captions button under the film, off until pressed,
// shows the words being said on the picture, near the bottom. While the
// film is stopped they sit higher, clear of the video's own controls. (No
// <track> element: iPhones won't load a video that has one.) If the video can't
// play, a link opens it by itself. Styled in src/theme/paper.css.
function FilmPlayer({ film, onStart }: { film: Film; onStart?: () => void }) {
  const [started, setStarted] = useState(false);
  const [broken, setBroken] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [lines, setLines] = useState<CaptionLine[] | null>(null);
  const [words, setWords] = useState("");
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const start = () => {
    const player = video.current;
    // Some browsers answer with a promise that fails if they won't play
    // yet; the controls are showing by then, so the viewer can press play
    void player?.play()?.catch(() => undefined);
    setStarted(true);
    onStart?.();
    player?.focus();
  };

  const toggleCaptions = () => {
    setCaptions(!captions);
    if (lines) return;
    void loadCaptions(film.captions).then((loaded) => {
      setLines(loaded);
      setWords(lineAt(loaded, video.current?.currentTime ?? 0));
    });
  };

  const shown = lines && lines.length === 0 ? "The captions can’t show right now." : words;

  return (
    <div className="paper-film-set">
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
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => lines && setWords(lineAt(lines, event.currentTarget.currentTime))}
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
        {captions && shown && (
          <p className={`paper-film__words${playing ? "" : " paper-film__words--raised"}`}>
            <span>{shown}</span>
          </p>
        )}
        {broken && (
          <p className="paper-film__broken">
            The film can’t play here. <a href={film.video}>Open the film</a>
          </p>
        )}
      </div>
      <div className="paper-film__captions">
        <button type="button" className="paper-film__captions-button" aria-pressed={captions} onClick={toggleCaptions}>
          Captions <span aria-hidden>{captions ? "on" : "off"}</span>
        </button>
      </div>
    </div>
  );
}

export default FilmPlayer;
