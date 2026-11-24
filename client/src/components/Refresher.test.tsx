import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Refresher from "./Refresher";
import { FILMS } from "../films";
import { REFRESHERS } from "../refreshers";

// The refresher pop-up: five short steps, from refreshers.ts

const simile = REFRESHERS.simile;

const renderRefresher = () => {
  const onClose = vi.fn();
  render(<Refresher words={simile} onClose={onClose} />);
  return { onClose, user: userEvent.setup() };
};

const dialog = () => screen.getByRole("dialog", { name: "What’s a simile?" });
const next = () => screen.getByRole("button", { name: /^(Next|Let’s try it|Start writing)$/ });

describe("Refresher", () => {
  it("is a dialog that opens on its first step, with the keyboard on its heading", () => {
    renderRefresher();

    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "What’s a simile?" })).toHaveFocus();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByText(simile.meaning)).toBeInTheDocument();
    expect(screen.getByText(simile.phrase).tagName).toBe("MARK");
    expect(screen.getByText(`Clue: ${simile.clue}`)).toBeInTheDocument();
  });

  it("says Not quite with the clue for a wrong pick, and waits for the right one", async () => {
    const { user } = renderRefresher();
    await user.click(screen.getByRole("button", { name: "Let’s try it" }));

    expect(screen.getByRole("heading", { name: "Spot it" })).toHaveFocus();
    expect(next()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: simile.spot.choices[0] }));
    expect(screen.getByRole("status")).toHaveTextContent(`Not quite. ${simile.spot.hint}`);
    expect(screen.getByRole("button", { name: simile.spot.choices[0] })).toHaveAttribute("aria-pressed", "true");
    expect(next()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: simile.spot.choices[1] }));
    expect(screen.getByRole("status")).toHaveTextContent(simile.spot.yes);
    expect(next()).toBeEnabled();
  });

  it("goes through every step to the end, and Start writing closes it", async () => {
    const { user, onClose } = renderRefresher();
    await user.click(next());
    for (const step of [simile.spot, simile.finish, simile.check]) {
      await user.click(screen.getByRole("button", { name: step.choices[step.answer] }));
      await user.click(next());
    }

    expect(screen.getByRole("heading", { name: "You’ve got it!" })).toHaveFocus();
    expect(screen.getByText(`Remember: ${simile.clue}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start writing" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the start of the sentence to finish", async () => {
    const { user } = renderRefresher();
    await user.click(next());
    await user.click(screen.getByRole("button", { name: simile.spot.choices[simile.spot.answer] }));
    await user.click(next());

    expect(screen.getByRole("heading", { name: "Finish it" })).toBeInTheDocument();
    expect(screen.getByText(simile.finish.start)).toBeInTheDocument();
  });

  it("goes back a step, and See it again starts over", async () => {
    const { user } = renderRefresher();
    await user.click(next());
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();

    await user.click(next());
    for (const step of [simile.spot, simile.finish, simile.check]) {
      await user.click(screen.getByRole("button", { name: step.choices[step.answer] }));
      await user.click(next());
    }
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "See it again" }));
    expect(screen.getByRole("heading", { name: "What’s a simile?" })).toHaveFocus();
  });

  it("closes with Close or the Esc key", async () => {
    const { user, onClose } = renderRefresher();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps the keyboard inside it", async () => {
    const { user } = renderRefresher();
    const buttons = within(dialog()).getAllByRole("button");
    const last = buttons[buttons.length - 1];

    last.focus();
    await user.tab();
    expect(within(dialog()).getByRole("button", { name: "Close" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  // A technique with a film (films.ts): the film takes the example's place on
  // the first step, and only plays when it's asked for
  describe("with a film", () => {
    const senses = REFRESHERS.senses;
    const film = FILMS.senses!;
    const renderWithFilm = () => {
      render(<Refresher words={senses} film={film} onClose={vi.fn()} />);
      return userEvent.setup();
    };

    it("offers the film on the first step, without loading or playing it", () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
      const { container } = render(<Refresher words={senses} film={film} onClose={vi.fn()} />);

      expect(screen.getByRole("button", { name: /^Watch the film/ })).toBeInTheDocument();
      const video = container.querySelector("video")!;
      expect(video).toHaveAttribute("preload", "none");
      expect(video).not.toHaveAttribute("autoplay");
      expect(video).not.toHaveAttribute("controls");
      expect(play).not.toHaveBeenCalled();
      // The written example waits for the last step
      expect(screen.queryByText(senses.phrase)).not.toBeInTheDocument();
      expect(screen.getByText(`Clue: ${senses.clue}`)).toBeInTheDocument();
      play.mockRestore();
    });

    it("plays it from the press itself, with its controls, and captions off until asked for", async () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
      const user = renderWithFilm();
      await user.click(screen.getByRole("button", { name: /^Watch the film/ }));

      expect(play).toHaveBeenCalledTimes(1);
      const video = screen.getByLabelText(film.title) as HTMLVideoElement;
      expect(video.tagName).toBe("VIDEO");
      expect(video.querySelector("source")).toHaveAttribute("src", film.video);
      expect(video).toHaveAttribute("controls");
      expect(video).toHaveFocus();
      expect(screen.queryByRole("button", { name: /^Watch the film/ })).not.toBeInTheDocument();
      const track = video.querySelector("track")!;
      expect(track).toHaveAttribute("kind", "captions");
      expect(track).toHaveAttribute("src", film.captions);
      expect(track).not.toHaveAttribute("default");
      play.mockRestore();
    });

    it("offers a link to the film if it can’t play", async () => {
      const { container } = render(<Refresher words={senses} film={film} onClose={vi.fn()} />);
      fireEvent.error(container.querySelector("source")!);

      expect(screen.getByRole("link", { name: "Open the film" })).toHaveAttribute("href", film.video);
    });

    it("stops the film when the step is left, and shows the written example at the end", async () => {
      const user = renderWithFilm();
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
      await user.click(screen.getByRole("button", { name: /^Watch the film/ }));
      play.mockRestore();
      await user.click(screen.getByRole("button", { name: "Let’s try it" }));
      expect(document.querySelector("video")).toBeNull();

      for (const step of [senses.spot, senses.finish, senses.check]) {
        await user.click(screen.getByRole("button", { name: step.choices[step.answer] }));
        await user.click(screen.getByRole("button", { name: "Next" }));
      }
      expect(screen.getByRole("heading", { name: "You’ve got it!" })).toBeInTheDocument();
      expect(screen.getByText(senses.phrase).tagName).toBe("MARK");
    });
  });
});
