import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import Welcome from "./Welcome";
import { OpenLoginContext } from "../components/loginPopup";
import examples from "../tellData";
import { phonePhotoMedia } from "../config";

// The Welcome screen: what a visitor who isn't signed in sees first. Each
// example is the same sentence told, then shown. They turn by themselves
// until the visitor picks one.

const [cold, hot] = examples;

// Pretend the device asked for less motion (or not)
const lessMotion = (wanted: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wanted && query.includes("prefers-reduced-motion"),
  }));

const turn = () => act(() => vi.advanceTimersByTime(3500));
const sentence = () => document.querySelector(".paper-welcome__sentence")?.textContent;
const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");
const bigPhoto = () => document.querySelector(".paper-welcome__photo img")!;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Welcome", () => {
  it("says what Show ME is, with one top heading", () => {
    render(<Welcome />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Don't just tell it. Show it!");
    expect(screen.getByText(/Turn boring sentences into pictures made of words/)).toBeInTheDocument();
    expect(screen.getByText("2 · Scribbles checks")).toBeInTheDocument();
    expect(screen.getByText("3 · Join the gallery")).toBeInTheDocument();
  });

  it("opens the sign-in pop-up from its button", () => {
    const openLogin = vi.fn();
    render(
      <OpenLoginContext.Provider value={openLogin}>
        <Welcome />
      </OpenLoginContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(openLogin).toHaveBeenCalledTimes(1);
  });

  it("starts on the first example's Tell sentence, with its photo faded", () => {
    render(<Welcome />);

    expect(sentence()).toBe(cold.tell);
    expect(pressed("Tell")).toBe("true");
    expect(pressed("Show")).toBe("false");
    expect(bigPhoto()).toHaveClass("paper-welcome__faded");
    expect(bigPhoto()).toHaveAttribute("alt", cold.alt);
  });

  it("Show swaps in the Show sentence and brings the photo to life; Tell goes back", () => {
    render(<Welcome />);

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(sentence()).toBe(cold.show);
    expect(pressed("Show")).toBe("true");
    expect(bigPhoto()).not.toHaveClass("paper-welcome__faded");

    fireEvent.click(screen.getByRole("button", { name: "Tell" }));
    expect(sentence()).toBe(cold.tell);
    expect(bigPhoto()).toHaveClass("paper-welcome__faded");
  });

  it("picking another example shows its Tell sentence and photo", () => {
    render(<Welcome />);
    const picker = within(screen.getByRole("group", { name: "More examples" }));

    expect(picker.getAllByRole("button")).toHaveLength(examples.length);
    fireEvent.click(picker.getByRole("button", { name: hot.short }));

    expect(sentence()).toBe(hot.tell);
    expect(bigPhoto()).toHaveAttribute("src", hot.picture);
    expect(picker.getByRole("button", { name: hot.short })).toHaveAttribute("aria-pressed", "true");
    expect(picker.getByRole("button", { name: cold.short })).toHaveAttribute("aria-pressed", "false");
  });

  it("turns by itself: Tell, then Show, then the next example, and around again", () => {
    vi.useFakeTimers();
    lessMotion(false);
    render(<Welcome />);

    expect(sentence()).toBe(cold.tell);
    turn();
    expect(sentence()).toBe(cold.show);
    turn();
    expect(sentence()).toBe(hot.tell);
    for (let i = 0; i < (examples.length - 1) * 2; i++) turn();
    expect(sentence()).toBe(cold.tell);
  });

  it("gives the visitor longer to read what they picked, then carries on", () => {
    vi.useFakeTimers();
    lessMotion(false);
    render(<Welcome />);

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    turn();
    expect(sentence()).toBe(cold.show);

    act(() => vi.advanceTimersByTime(8000 - 3500));
    expect(sentence()).toBe(hot.tell);
    turn();
    expect(sentence()).toBe(hot.show);
  });

  it("waits while the mouse is on the examples, and carries on after", () => {
    vi.useFakeTimers();
    lessMotion(false);
    render(<Welcome />);
    const examplesBox = screen.getByRole("region", { name: "Tell versus Show examples" });

    fireEvent.pointerEnter(examplesBox, { pointerType: "mouse" });
    turn();
    expect(sentence()).toBe(cold.tell);

    fireEvent.pointerLeave(examplesBox, { pointerType: "mouse" });
    turn();
    expect(sentence()).toBe(cold.show);
  });

  // A tap also "enters" the examples, but a finger never leaves them
  it("doesn't wait for a finger that tapped the examples", () => {
    vi.useFakeTimers();
    lessMotion(false);
    render(<Welcome />);

    fireEvent.pointerEnter(screen.getByRole("region", { name: "Tell versus Show examples" }), {
      pointerType: "touch",
    });
    turn();

    expect(sentence()).toBe(cold.show);
  });

  describe("for someone who asked their device for less motion", () => {
    it("still turns by itself, with a button to pause it", () => {
      vi.useFakeTimers();
      lessMotion(true);
      render(<Welcome />);

      turn();
      expect(sentence()).toBe(cold.show);

      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      turn();
      turn();
      expect(sentence()).toBe(cold.show);
      expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      turn();
      expect(sentence()).toBe(hot.tell);
    });

    it("has no pause button for everyone else", () => {
      lessMotion(false);
      render(<Welcome />);

      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    });
  });

  // Screen readers can miss a change that lands at the same moment the
  // region is switched on, so it is on before the press: from when the
  // mouse (or keyboard) reaches the examples
  it("reads a change out when the visitor made it, not while it plays by itself", () => {
    vi.useFakeTimers();
    lessMotion(false);
    render(<Welcome />);
    const words = document.querySelector(".paper-welcome__words")!;
    const examplesBox = screen.getByRole("region", { name: "Tell versus Show examples" });

    expect(words).toHaveAttribute("aria-live", "off");
    fireEvent.pointerEnter(examplesBox, { pointerType: "mouse" });
    expect(words).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    fireEvent.pointerLeave(examplesBox, { pointerType: "mouse" });
    expect(words).toHaveAttribute("aria-live", "polite");

    // Playing by itself again: quiet
    act(() => vi.advanceTimersByTime(8000));
    expect(words).toHaveAttribute("aria-live", "off");
  });

  describe("the other examples' photos", () => {
    // What `new Image().src = ...` asked for
    const fetchedPhotos = () => {
      const asked: string[] = [];
      vi.stubGlobal(
        "Image",
        class {
          set src(url: string) {
            asked.push(url);
          }
        }
      );
      return asked;
    };
    const theRest = examples.slice(1).map((example) => example.picture);

    it("wait for the first photo, then download, once", () => {
      const asked = fetchedPhotos();
      render(<Welcome />);
      expect(asked).toEqual([]);

      fireEvent.load(bigPhoto());
      expect(asked).toEqual(theRest);

      fireEvent.click(screen.getByRole("button", { name: hot.short }));
      fireEvent.click(screen.getByRole("button", { name: cold.short }));
      fireEvent.load(bigPhoto());
      expect(asked).toEqual(theRest);
    });

    it("don't wait for a first photo that fails", () => {
      const asked = fetchedPhotos();
      render(<Welcome />);

      fireEvent.error(bigPhoto());

      expect(asked).toEqual(theRest);
    });

    // On a slow connection the first photo may still be on its way
    it("download when the first example is left before its photo arrived", () => {
      const asked = fetchedPhotos();
      render(<Welcome />);

      fireEvent.click(screen.getByRole("button", { name: hot.short }));

      expect(asked).toEqual(theRest);
    });
  });

  // index.html starts downloading the first photo early (vite.config.ts), in
  // the shape this screen will ask for: the phone-shaped copy on phones held
  // upright, the full photo elsewhere
  it("offers the phone-shaped copy of the big photo to phones held upright", () => {
    render(<Welcome />);

    const source = document.querySelector(".paper-welcome__photo source")!;
    expect(source).toHaveAttribute("media", phonePhotoMedia);
    expect(source).toHaveAttribute("srcset", cold.phonePicture);
    expect(bigPhoto()).toHaveAttribute("src", cold.picture);
    expect(bigPhoto()).toHaveAttribute("fetchpriority", "high");
  });

  it("hides Scribbles from screen readers: his speech bubble says it", () => {
    render(<Welcome />);

    expect(screen.queryByRole("img", { name: "Scribbles the pencil" })).not.toBeInTheDocument();
    expect(screen.getByText("Tap Show and watch the words come alive!")).toBeInTheDocument();
  });
});
