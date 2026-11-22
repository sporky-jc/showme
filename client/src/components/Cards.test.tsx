import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import Cards from "./Cards";
import { renderWithApp } from "../test/testUtils";
import type { GallerySentence } from "../api/types";

// The gallery's cards: one per approved sentence, under its Tell sentence's
// photo.

const tellsentences = [
  { key: 1, id: "day1", technique: "senses" as const, title: "Day 1", tell: "It is cold outside.", image: "/cold.jpg" },
  { key: 2, id: "day2", technique: "senses" as const, title: "Day 2", tell: "It is hot outside.", image: "/hot.jpg" },
];

const approved = (n: number, prefix = "Show"): GallerySentence[] =>
  Array.from({ length: n }, (_, i) => ({
    _id: `${prefix}-${i}`,
    title: `day${(i % 2) + 1}`,
    tell: tellsentences[i % 2].tell,
    show: `${prefix} ${i + 1}`,
    approved: true,
    toRedo: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    // The server sends only the initial (see GalleryAuthor in the contract)
    author: { firstName: "Ada", lastName: "L" },
  }));

const renderCards = (sentences: GallerySentence[]) =>
  renderWithApp(<Cards displaySentences={sentences} />, {
    state: { tellsentences },
  });

const pictures = () => screen.queryAllByRole("img");

describe("Cards", () => {
  it("shows each sentence with its tell sentence and the author's first name and initial", () => {
    renderCards(approved(2));

    expect(screen.getByText("Show 1")).toBeInTheDocument();
    expect(screen.getByText("It is cold outside.")).toBeInTheDocument();
    expect(screen.getByText("Show 2")).toBeInTheDocument();
    expect(screen.getAllByText("Ada L.")).toHaveLength(2);
  });

  it("finds each sentence's picture by its Tell's id, wherever the Tell is in the list", () => {
    renderWithApp(<Cards displaySentences={approved(2)} />, {
      state: { tellsentences: [...tellsentences].reverse() },
    });

    const [first, second] = document.querySelectorAll("img");
    expect(first).toHaveAttribute("src", "/cold.jpg");
    expect(second).toHaveAttribute("src", "/hot.jpg");
  });

  it("shows the Tell without its \"(Use a …)\" ask", () => {
    renderCards([{ ...approved(1)[0], tell: "The gale blew the flowers back and forth. (Use Personification)" }]);

    expect(screen.getByText("The gale blew the flowers back and forth.")).toBeInTheDocument();
  });

  it("frames each card in the color its author picked, and Grape when they haven't", () => {
    const [picked, none] = approved(2);
    renderCards([{ ...picked, look: { frame: "teal" } }, none]);

    const frames = [...document.querySelectorAll<HTMLElement>(".paper-gallery__card")];
    expect(frames.map((frame) => frame.style.getPropertyValue("--frame-color"))).toEqual([
      "var(--paper-frame-teal)",
      "var(--paper-frame-violet)",
    ]);
  });

  // The Show sentence is the star: the words that use a sense light up in
  // that sense's color, and the card says which senses it uses
  it("lights up the words that use a sense", () => {
    const [one] = approved(1);
    renderCards([{ ...one, show: "Frost crunched under my boots, and my ears were cold." }]);

    const lit = [...document.querySelectorAll("mark")];
    expect(lit.map((mark) => mark.textContent)).toEqual(["crunched", "cold"]);
    expect(lit.map((mark) => mark.className)).toEqual([
      "paper-gallery__sense paper-gallery__sense--hear",
      "paper-gallery__sense paper-gallery__sense--feel",
    ]);
    // Still one sentence, word for word
    expect(document.querySelector(".paper-gallery__show")).toHaveTextContent(
      "Frost crunched under my boots, and my ears were cold."
    );
    expect(screen.getByRole("img", { name: "Uses hear and feel" })).toBeInTheDocument();
  });

  it("lights up the words two AI models agreed on, in the sense they agreed", () => {
    const [one] = approved(1);
    renderCards([
      {
        ...one,
        show: "Wind wailed through the trees, and the roses had a sweet perfume.",
        // From the sense tagger (backend/tagger): "wailed" isn't on the word
        // list, and "sweet" is a smell here, not a taste
        senseTags: [
          { word: "wailed", sense: "hear" },
          { word: "sweet", sense: "smell" },
        ],
      },
    ]);

    const lit = [...document.querySelectorAll("mark")];
    expect(lit.map((mark) => [mark.textContent, mark.className.split("--")[1]])).toEqual([
      ["wailed", "hear"],
      ["sweet", "smell"],
      ["perfume", "smell"],
    ]);
    expect(screen.getByRole("img", { name: "Uses hear and smell" })).toBeInTheDocument();
  });

  it("names three or more senses in a list", () => {
    const [one] = approved(1);
    renderCards([{ ...one, show: "The bright soup smelled sweet and hot." }]);

    expect(screen.getByRole("img", { name: "Uses see, feel, smell and taste" })).toBeInTheDocument();
  });

  it("has no senses to name for a sentence that uses none", () => {
    renderCards(approved(1));

    expect(document.querySelector("mark")).toBeNull();
    expect(screen.queryByRole("img", { name: /^Uses/ })).not.toBeInTheDocument();
  });

  // Crossed out on screen; its text is the Tell's alone, as before
  it("keeps the Tell's text exactly the Tell", () => {
    renderCards(approved(1));

    expect(document.querySelector(".paper-gallery__tell")?.textContent).toBe("It is cold outside.");
  });

  it("shows at most 12 cards", () => {
    renderCards(approved(15));

    expect(screen.getAllByText(/^Show \d+$/)).toHaveLength(12);
  });

  it("uses the picture of the matching day", () => {
    renderCards(approved(2));

    const [first, second] = document.querySelectorAll("img");
    expect(first).toHaveAttribute("src", "/cold.jpg");
    expect(second).toHaveAttribute("src", "/hot.jpg");
  });

  // The photos are scenery: the sentences under them say everything
  it("hides the pictures from screen readers, and lets cards down the page wait to download theirs", () => {
    renderCards(approved(2));

    expect(pictures()).toHaveLength(0);
    document.querySelectorAll("img").forEach((img) => {
      expect(img).toHaveAttribute("alt", "");
      expect(img).toHaveAttribute("loading", "lazy");
    });
  });

  it("is a list with one card per sentence", () => {
    renderCards(approved(3));

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("shows no likes without any to show", () => {
    renderCards(approved(2));

    expect(screen.queryByRole("button", { name: "Like" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\blikes?\b/)).not.toBeInTheDocument();
  });

  // The database doesn't require a last name: older accounts, and Google
  // accounts without one, have none (or an empty one). One such card used to
  // stop the whole gallery from drawing.
  it("shows just the first name when the author has no last name", () => {
    const [ada, bo, cy] = approved(3);
    renderCards([
      ada,
      { ...bo, author: { firstName: "Bo" } },
      { ...cy, author: { firstName: "Cy", lastName: "" } },
    ]);

    expect(screen.getByText("Ada L.")).toBeInTheDocument();
    expect(screen.getByText("Bo")).toBeInTheDocument();
    expect(screen.getByText("Cy")).toBeInTheDocument();
  });

  // A server from before surnames were cut to their initial sent the whole
  // surname: the card still shows just its first letter
  it("shows the same name from a whole surname", () => {
    const [ada] = approved(1);
    renderCards([{ ...ada, author: { firstName: "Ada", lastName: "Lovelace" } }]);

    expect(screen.getByText("Ada L.")).toBeInTheDocument();
    expect(screen.queryByText(/Lovelace/)).not.toBeInTheDocument();
  });
});
