import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeFilm from "./WelcomeFilm";
import { WELCOME_FILM } from "../films";

// "Watch how it works" on the Welcome page: the Welcome film in a pop-up
const open = async () => {
  const onSignIn = vi.fn();
  const user = userEvent.setup();
  render(<WelcomeFilm onSignIn={onSignIn} />);
  await user.click(screen.getByRole("button", { name: "Watch how it works" }));
  return { user, onSignIn, dialog: screen.getByRole("dialog", { name: WELCOME_FILM.title }) };
};

describe("WelcomeFilm", () => {
  it("is only a button until it's pressed", () => {
    const { container } = render(<WelcomeFilm onSignIn={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Watch how it works" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
  });

  it("opens the film, which waits for its own play button", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const { user, dialog } = await open();
    expect(screen.getByRole("heading", { name: WELCOME_FILM.title })).toHaveFocus();
    const video = dialog.querySelector("video")!;
    expect(video).toHaveAttribute("preload", "none");
    expect(video.querySelector("source")).toHaveAttribute("src", WELCOME_FILM.video);
    expect(play).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /^Watch the film/ }));
    expect(play).toHaveBeenCalledTimes(1);
    play.mockRestore();
  });

  it("shuts with Close or Esc, and the keyboard goes back to its button", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Watch how it works" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Watch how it works" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab and Shift+Tab going round inside the pop-up", async () => {
    const { user, dialog } = await open();
    const buttons = within(dialog).getAllByRole("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    // From the heading, back goes to the last button, and on from there to the first
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
  });

  it("offers the way to sign in under the film", async () => {
    const { user, onSignIn, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Sign in with Google" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
