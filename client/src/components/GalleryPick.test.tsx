import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GalleryPick from "./GalleryPick";
import { renderWithApp } from "../test/testUtils";
import type { GallerySentence } from "../api/types";

// Scribbles' pick: one approved sentence, big, at the top of the gallery,
// with its Tell crossed out and its sense words lit up.

const tellsentences = [
  { key: 1, id: "day1", technique: "senses" as const, title: "Day 1", tell: "It is cold outside.", image: "/cold.jpg" },
];

const sentence: GallerySentence = {
  _id: "p1",
  title: "day1",
  tell: "It is cold outside.",
  show: "Frost crunched under my boots, and my ears were cold.",
  approved: true,
  toRedo: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  author: { firstName: "Noah", lastName: "K" },
  look: { frame: "teal" },
};

// `lit`: the senseHighlights feature (see features.ts)
const renderPick = ({ signedIn = false, more = true, lit = true } = {}) => {
  const onAnother = vi.fn();
  renderWithApp(
    <GalleryPick sentence={sentence} signedIn={signedIn} onAnother={more ? onAnother : undefined} />,
    { state: { tellsentences, features: { senseHighlights: lit, senseCoach: false } } }
  );
  return { onAnother };
};

const pick = () => screen.getByRole("region", { name: "Scribbles’ pick" });

describe("GalleryPick", () => {
  it("shows the Tell, then the sentence that shows it, and who wrote it", () => {
    renderPick();

    expect(pick()).toHaveTextContent("It is cold outside.");
    expect(document.querySelector(".paper-pick__show")).toHaveTextContent(
      "Frost crunched under my boots, and my ears were cold."
    );
    expect(pick()).toHaveTextContent("Noah K. showed it.");
    expect(screen.getByText("Tell says it. Show lets you see it!")).toBeInTheDocument();
  });

  it("shows the sentence plain, with no list of senses, when sense highlights are off", () => {
    renderPick({ lit: false });

    expect(pick().querySelector("mark")).toBeNull();
    expect(pick().querySelector(".paper-pick__show")).toHaveTextContent(sentence.show);
    expect(screen.queryByRole("list", { name: "Senses in this sentence" })).not.toBeInTheDocument();
  });

  it("lights up the sense words and lists each sense with its words", () => {
    renderPick();

    expect([...pick().querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual(["crunched", "cold"]);
    const senses = screen.getByRole("list", { name: "Senses in this sentence" });
    expect([...senses.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Hear: crunched", "Feel: cold"]);
  });

  it("shows the Tell's photo in the author's frame", () => {
    renderPick();

    const photo = pick().querySelector("img");
    expect(photo).toHaveAttribute("src", "/cold.jpg");
    expect(photo).toHaveAttribute("alt", "");
    expect((pick().querySelector(".paper-pick__frame") as HTMLElement).style.getPropertyValue("--frame-color")).toBe(
      "var(--paper-frame-teal)"
    );
  });

  it("asks for another one", async () => {
    const user = userEvent.setup();
    const { onAnother } = renderPick();

    await user.click(screen.getByRole("button", { name: "Show me another" }));

    expect(onAnother).toHaveBeenCalledTimes(1);
  });

  it("has no Show me another when there's no other one", () => {
    renderPick({ more: false });

    expect(screen.queryByRole("button", { name: "Show me another" })).not.toBeInTheDocument();
  });

  it("invites a visitor to try one, on the About page (/about)", () => {
    renderPick();

    expect(screen.getByRole("link", { name: "Try one yourself" })).toHaveAttribute("href", "/about");
  });

  it("doesn't invite a signed-in student, who can write their own", () => {
    renderPick({ signedIn: true });

    expect(screen.queryByRole("link", { name: "Try one yourself" })).not.toBeInTheDocument();
  });
});
