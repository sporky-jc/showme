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
// fills the screen, in real full screen so the browser's own bars are gone:
// - An iPhone can only make a video full screen, in its own player, and does
//   that by itself when a video without `playsinline` plays (`ownPlayer`).
//   That player can't show our words, so there they also go to the video as
//   a text track, shown only while its player is up.
// - Other phones make our whole set full screen (`big`): the video, the
//   Captions button and the words, with a button back to the page. If the
//   browser says no, the set still covers the page.
// Either way the captions come on with it; the viewer can turn them off.
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

// Safari (every browser on an iPhone is Safari inside). An iPhone says it
// can make a part of the page full screen but doesn't do it, so there the
// film goes to the phone's own player. Only Safari has this property.
const ownPlayer = () => "webkitSupportsPresentationMode" in HTMLVideoElement.prototype;

function FilmPlayer({ film, onStart, about, quiet }: Props) {
  const [started, setStarted] = useState(false);
  const [broken, setBroken] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [lines, setLines] = useState<CaptionLine[] | null>(null);
  const [words, setWords] = useState("");
  const [playing, setPlaying] = useState(false);
  const [big, setBig] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const set = useRef<HTMLDivElement>(null);
  const loading = useRef<Promise<CaptionLine[]> | null>(null);

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

  // An iPhone's own player: our words show while it is up, and it shuts
  // when the film ends
  useEffect(() => {
    const player = video.current;
    if (!ownPlayer() || !player) return;
    const show = (mode: TextTrackMode) => () => {
      for (const track of Array.from(player.textTracks)) track.mode = mode;
    };
    const up = show("showing");
    const down = show("hidden");
    player.addEventListener("webkitbeginfullscreen", up);
    player.addEventListener("webkitendfullscreen", down);
    return () => {
      player.removeEventListener("webkitbeginfullscreen", up);
      player.removeEventListener("webkitendfullscreen", down);
    };
  }, []);

  const loadLines = () => {
    loading.current ??= loadCaptions(film.captions).then((loaded) => {
      setLines(loaded);
      setWords(lineAt(loaded, video.current?.currentTime ?? 0));
      return loaded;
    });
    return loading.current;
  };

  const grow = () => {
    if (ownPlayer()) {
      // The track is made now, before the player opens, and filled when the
      // words arrive (not a <track> element: an iPhone won't load the video)
      const player = video.current;
      if (!player || player.textTracks.length > 0) return;
      const track = player.addTextTrack("captions", "English", "en");
      track.mode = "hidden";
      void loadLines().then((loaded) =>
        loaded.forEach((line) => track.addCue(new VTTCue(line.start, line.end, line.text)))
      );
      return;
    }
    if (big || !onAPhone()) return;
    setBig(true);
    setCaptions(true);
    void loadLines();
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

  const toggleCaptions = () => {
    setCaptions(!captions);
    void loadLines();
  };

  const shown = lines && lines.length === 0 ? "The captions can’t show right now." : words;

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
            setPlaying(true);
            grow();
            // One film at a time
            const mine = event.currentTarget;
            document.querySelectorAll("video").forEach((other) => {
              if (other !== mine) other.pause();
            });
          }}
          onPause={() => setPlaying(false)}
          onEnded={(event) => {
            setBig(false);
            (event.currentTarget as HTMLVideoElement & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
          }}
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
