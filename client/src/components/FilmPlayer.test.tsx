import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FilmPlayer from "./FilmPlayer";
import { WELCOME_FILM } from "../films";

// On a phone a playing film fills the screen (the big view); on a wider
// screen it stays where it is.
const onAPhone = (phone: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: phone, media: query }));

const play = () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  fireEvent.click(screen.getByRole("button", { name: /^Watch the film/ }));
};
const set = () => document.querySelector(".paper-film-set")!;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FilmPlayer", () => {
  it("fills the screen on a phone once play is pressed, with a way back", () => {
    onAPhone(true);
    render(<FilmPlayer film={WELCOME_FILM} />);
    // Not before the press: a film never starts or grows by itself
    expect(set()).not.toHaveClass("paper-film-set--big");
    expect(screen.queryByRole("button", { name: "Back to the page" })).not.toBeInTheDocument();

    play();
    expect(set()).toHaveClass("paper-film-set--big");
    expect(document.documentElement).toHaveClass("paper-film-open");
    // The captions come on with it, and the viewer can turn them off
    expect(screen.getByRole("button", { name: /^Captions/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Back to the page" }));
    expect(set()).not.toHaveClass("paper-film-set--big");
    expect(document.documentElement).not.toHaveClass("paper-film-open");
  });

  it("leaves the big view on Esc without passing the key on, and when the film ends", () => {
    onAPhone(true);
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <FilmPlayer film={WELCOME_FILM} />
      </div>
    );
    play();
    fireEvent.keyDown(screen.getByRole("button", { name: "Back to the page" }), { key: "Escape" });
    expect(set()).not.toHaveClass("paper-film-set--big");
    expect(outer).not.toHaveBeenCalled();

    // Playing again makes it big again; the end brings the page back
    const video = document.querySelector("video")!;
    fireEvent.play(video);
    expect(set()).toHaveClass("paper-film-set--big");
    fireEvent.ended(video);
    expect(set()).not.toHaveClass("paper-film-set--big");
  });

  it("asks the browser for real full screen, and comes back when that ends", () => {
    onAPhone(true);
    const ask = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { value: ask, configurable: true });
    try {
      render(<FilmPlayer film={WELCOME_FILM} />);
      play();
      expect(ask).toHaveBeenCalledTimes(1);
      expect(ask.mock.contexts[0]).toBe(set());
      // The viewer leaves full screen with the phone's own back or Esc
      fireEvent(document, new Event("fullscreenchange"));
      expect(set()).not.toHaveClass("paper-film-set--big");
    } finally {
      delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
    }
  });

  it("on an iPhone, leaves the full screen to the phone's own player and gives it the words", () => {
    onAPhone(true);
    const track = { mode: "disabled", addCue: vi.fn() };
    const proto = HTMLVideoElement.prototype as unknown as Record<string, unknown>;
    proto.webkitSupportsPresentationMode = () => true;
    const add = vi.fn(() => track);
    proto.addTextTrack = add;
    try {
      render(<FilmPlayer film={WELCOME_FILM} />);
      const video = document.querySelector("video")!;
      // No playsinline: that is what sends an iPhone to its own player
      expect(video).not.toHaveAttribute("playsinline");
      play();
      expect(set()).not.toHaveClass("paper-film-set--big");
      expect(track.mode).toBe("hidden");
      // Playing again doesn't make a second track (every line would show twice)
      fireEvent.play(video);
      expect(add).toHaveBeenCalledTimes(1);
      fireEvent(video, new Event("webkitbeginfullscreen"));
      expect(track.mode).toBe("showing");
      fireEvent(video, new Event("webkitendfullscreen"));
      expect(track.mode).toBe("hidden");
    } finally {
      delete proto.webkitSupportsPresentationMode;
      delete proto.addTextTrack;
    }
  });

  it("stays in the page on a wider screen", () => {
    onAPhone(false);
    render(<FilmPlayer film={WELCOME_FILM} />);
    play();
    expect(set()).not.toHaveClass("paper-film-set--big");
    expect(screen.queryByRole("button", { name: "Back to the page" })).not.toBeInTheDocument();
  });
});
