import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Films from "./Films";
import { FILMS } from "../films";
import { REFRESHERS } from "../refreshers";
import { renderWithApp } from "../test/testUtils";

// The Films page: every film, for anyone, signed in or not
const renderFilms = () => renderWithApp(<Films />, { state: { user: {} }, route: "/Films" });

describe("Films", () => {
  it("shows a card for every film, with its own play button", () => {
    renderFilms();
    expect(screen.getByRole("heading", { level: 1, name: "Films" })).toBeInTheDocument();
    const names: string[] = Object.keys(FILMS).map((technique) => REFRESHERS[technique as keyof typeof REFRESHERS].name);
    expect(names).toHaveLength(8);
    names.unshift("How Show ME works");
    for (const name of names) {
      const card = screen.getByRole("heading", { level: 2, name }).closest("li")!;
      expect(within(card).getByRole("button", { name: new RegExp(`^Watch the film: ${name}, \\d+ seconds$`) })).toBeInTheDocument();
    }
  });

  it("uses the small pictures, and downloads no film until asked", () => {
    const { container } = renderFilms();
    const videos = [...container.querySelectorAll("video")];
    expect(videos).toHaveLength(9);
    for (const video of videos) {
      expect(video).toHaveAttribute("preload", "none");
      expect(video.getAttribute("poster")).toMatch(/poster-small\.jpg$/);
    }
  });

  it("starts a film from its press, and stops the other films", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const user = userEvent.setup();
    const { container } = renderFilms();
    await user.click(screen.getByRole("button", { name: /^Watch the film: Simile/ }));
    expect(play).toHaveBeenCalledTimes(1);

    const videos = [...container.querySelectorAll("video")];
    fireEvent.play(videos[2]);
    expect(pause).toHaveBeenCalledTimes(8);
    expect(pause.mock.contexts).not.toContain(videos[2]);
    play.mockRestore();
    pause.mockRestore();
  });

  it("has a way back home", () => {
    renderFilms();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});
