import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import Cards from "./Cards";
import { renderWithApp } from "../test/testUtils";
import type { SentenceWithAuthor } from "../api/types";

// The gallery's cards: one per approved sentence, under its Tell sentence's
// photo.

const tellsentences = [
  { key: 1, title: "Day 1", tell: "It is cold outside.", image: "/cold.jpg" },
  { key: 2, title: "Day 2", tell: "It is hot outside.", image: "/hot.jpg" },
];

const approved = (n: number, prefix = "Show"): SentenceWithAuthor[] =>
  Array.from({ length: n }, (_, i) => ({
    _id: `${prefix}-${i}`,
    title: `day${(i % 2) + 1}`,
    tell: tellsentences[i % 2].tell,
    show: `${prefix} ${i + 1}`,
    approved: true,
    toRedo: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    author: { firstName: "Ada", lastName: "Lovelace" },
  }));

const renderCards = (sentences: SentenceWithAuthor[]) =>
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
});
