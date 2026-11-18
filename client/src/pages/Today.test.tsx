import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import Today from "./Today";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";
import type { Sentence, TellSentence } from "../api/types";

// Today: a signed-in student's home. Today's Tell sentence is the one after
// their last sentence, with the way to start writing and where their latest
// sentences stand.

const ada = { firstName: "Ada", isAdmin: false };

// Tell sentences "Tell 1".."Tell N" for days 1..N
const tells = (n: number): TellSentence[] =>
  Array.from({ length: n }, (_, i) => ({
    key: i + 1,
    title: `Day ${i + 1}`,
    tell: `Tell ${i + 1}`,
    image: `/day${i + 1}.jpg`,
  }));

// The student's own sentences for days 1..n ("Show 1".."Show n")
const shows = (n: number, each: Partial<Sentence> = {}): Sentence[] =>
  Array.from({ length: n }, (_, i) => ({
    _id: `s${i + 1}`,
    title: `day${i + 1}`,
    tell: `Tell ${i + 1}`,
    show: `Show ${i + 1}`,
    approved: false,
    toRedo: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...each,
  }));

// Draw Today for a signed-in Ada; the pretend server answers GET /MyPage
// with `mine` (or with `answer`, to hold it back)
const renderToday = ({
  tellCount = 12,
  mine = [],
  answer,
}: { tellCount?: number; mine?: Sentence[]; answer?: Promise<Outcome> } = {}) =>
  renderWithApp(<Today />, {
    state: { user: ada, tellsentences: tells(tellCount) },
    respond: (config) =>
      config.url === "/MyPage" ? answer ?? { status: 200, data: mine } : 200,
  });

const notes = () => within(screen.getByRole("region", { name: "My sentences" })).getAllByRole("link");

describe("Today", () => {
  it("greets the student by first name", async () => {
    renderToday();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Hi Ada!");
  });

  it("shows Day 1's Tell sentence to a student who hasn't written yet", async () => {
    renderToday();

    expect(await screen.findByText("“Tell 1”")).toBeInTheDocument();
    expect(screen.getByText("Today's Tell")).toBeInTheDocument();
    expect(document.querySelector(".paper-today__photo")).toHaveAttribute("src", "/day1.jpg");
  });

  it("moves on to the Tell sentence after the student's last one", async () => {
    renderToday({ mine: shows(3) });

    expect(await screen.findByText("“Tell 4”")).toBeInTheDocument();
    expect(document.querySelector(".paper-today__photo")).toHaveAttribute("src", "/day4.jpg");
  });

  it("'Start showing' leads to MyPage, where sentences are written", async () => {
    renderToday();

    expect(await screen.findByRole("link", { name: "Start showing" })).toHaveAttribute("href", "/MyPage");
  });

  // The day is counted from the student's list, so Day 1 must not flash up
  // for someone on Day 4 while the list is still on its way
  it("shows the loader, not a Tell sentence, until the student's list arrives", async () => {
    let release!: (outcome: Outcome) => void;
    const answer = new Promise<Outcome>((resolve) => (release = resolve));
    renderToday({ answer });

    expect(screen.queryByText("“Tell 1”")).not.toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    release({ status: 200, data: shows(3) });
    expect(await screen.findByText("“Tell 4”")).toBeInTheDocument();
  });

  it("says so when every Tell sentence has been written for, and points to Collections", async () => {
    renderToday({ tellCount: 2, mine: shows(2) });

    expect(await screen.findByText("You showed every sentence!")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start showing" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the class collection" })).toHaveAttribute("href", "/Collections");
  });

  it("lists the three latest sentences, newest first, each linked to MyPage", async () => {
    renderToday({ mine: shows(5) });
    await screen.findByText("“Tell 6”");

    expect(notes().map((note) => note.querySelector(".paper-note__show")?.textContent)).toEqual([
      "Show 5",
      "Show 4",
      "Show 3",
    ]);
    notes().forEach((note) => expect(note).toHaveAttribute("href", "/MyPage"));
  });

  it("says where each sentence stands: done, try again, or waiting", async () => {
    const [done, redo, waiting] = shows(3);
    renderToday({
      mine: [
        { ...done, approved: true },
        { ...redo, toRedo: true },
        waiting,
      ],
    });
    await screen.findByText("“Tell 4”");

    const [third, second, first] = notes();
    expect(first).toHaveTextContent("Done · in Collections");
    expect(first).toHaveClass("paper-note--done");
    expect(second).toHaveTextContent("Try again");
    expect(second).toHaveClass("paper-note--retry");
    expect(third).toHaveTextContent("Waiting to be checked");
    expect(third).toHaveClass("paper-note--wait");
  });

  it("has no 'My sentences' section before the first sentence", async () => {
    renderToday();
    await screen.findByText("“Tell 1”");

    expect(screen.queryByRole("region", { name: "My sentences" })).not.toBeInTheDocument();
  });

  it("counts the sentences that passed review", async () => {
    renderToday({ mine: [...shows(2, { approved: true }), ...shows(1).map((s) => ({ ...s, _id: "s3" }))] });

    expect(await screen.findByText("2 sentences shown")).toBeInTheDocument();
  });

  it("says '1 sentence shown' for one, and nothing for none", async () => {
    const one = renderToday({ mine: shows(1, { approved: true }) });
    expect(await screen.findByText("1 sentence shown")).toBeInTheDocument();
    one.unmount();

    renderToday({ mine: shows(1) });
    await screen.findByText("“Tell 2”");
    expect(screen.queryByText(/shown$/)).not.toBeInTheDocument();
  });

  it("brings Scribbles along", async () => {
    renderToday();

    expect(await screen.findByRole("img", { name: "Scribbles the pencil" })).toBeInTheDocument();
  });
});
