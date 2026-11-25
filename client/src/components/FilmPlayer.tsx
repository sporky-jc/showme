import React, { useEffect, useRef, useState } from "react";
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
// shows the words being said. On a phone they go in a strip under the
// picture, which is too small to cover; on wider screens they go on the
// picture, near the bottom (higher while the film is stopped, clear of the
// video's own controls). Both are here and paper.css shows one. (No <track>
// element: iPhones won't load a video that has one.) If the video can't
// play, a link opens it by itself. Styled in src/theme/paper.css.
//
// On a phone the picture in the page is small, so while the film plays it
// fills the screen (`big`): the same video, held in place over the page, with
// the Captions button and the words under it and a button back to the page.
// Turning the phone on its side makes the picture fill the screen. It is our
// own big view, not the browser's full screen, because an iPhone's full
// screen can't show our captions.
//
// On the Films page, where there are many: `about` names the film in the
// play button ("Watch the film: Simile"), the Captions button waits until
// the film has started (`quiet`), and starting one film stops the others.
interface Props {
  film: Film;
  onStart?: () => void;
  about?: string;
  quiet?: boolean;
}

// A phone, held either way up
const onAPhone = () => window.matchMedia?.("(max-width: 640px), (max-height: 500px)").matches ?? false;

function FilmPlayer({ film, onStart, about, quiet }: Props) {
  const [started, setStarted] = useState(false);
  const [broken, setBroken] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [lines, setLines] = useState<CaptionLine[] | null>(null);
  const [words, setWords] = useState("");
  const [playing, setPlaying] = useState(false);
  const [big, setBig] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  // The page under the big view stays where it is
  useEffect(() => {
    if (!big) return;
    document.documentElement.classList.add("paper-film-open");
    return () => document.documentElement.classList.remove("paper-film-open");
  }, [big]);

  const start = () => {
    const player = video.current;
    // Some browsers answer with a promise that fails if they won't play
    // yet; the controls are showing by then, so the viewer can press play
    void player?.play()?.catch(() => undefined);
    setStarted(true);
    setBig(onAPhone());
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
    <div
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
          playsInline
          preload="none"
          // So the keyboard can land on it in every browser, once it's playing
          tabIndex={started ? 0 : -1}
          onPlay={(event) => {
            setPlaying(true);
            setBig(onAPhone());
            // One film at a time
            const mine = event.currentTarget;
            document.querySelectorAll("video").forEach((other) => {
              if (other !== mine) other.pause();
            });
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setBig(false)}
          onTimeUpdate={(event) => lines && setWords(lineAt(lines, event.currentTarget.currentTime))}
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
      {(started || !quiet) && (
        <div className="paper-film__captions">
          <button type="button" className="paper-film__captions-button" aria-pressed={captions} onClick={toggleCaptions}>
            Captions <span aria-hidden>{captions ? "on" : "off"}</span>
          </button>
          {captions && <p className="paper-film__strip">{shown}</p>}
        </div>
      )}
    </div>
  );
}

export default FilmPlayer;
