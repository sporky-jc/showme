import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import Today from "./Today";
import { renderWithApp } from "../test/testUtils";
import type { Outcome, Respond } from "../test/testUtils";
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
// with `mine` (or with `answer`, to hold it back, or `respond`, for anything
// else). `remembered`: how many Tell sentences this browser already has.
const renderToday = ({
  tellCount = 12,
  remembered = tellCount,
  mine = [],
  answer,
  respond,
}: {
  tellCount?: number;
  remembered?: number;
  mine?: Sentence[];
  answer?: Promise<Outcome>;
  respond?: Respond;
} = {}) => {
  const requests: string[] = [];
  const view = renderWithApp(<Today />, {
    state: { user: ada, tellsentences: tells(remembered) },
    respond: (config) => {
      requests.push(`${config.method} ${config.url}`);
      if (respond) return respond(config);
      if (config.url === "/MyPage") return answer ?? { status: 200, data: mine };
      if (config.url === "/") return { status: 200, data: tells(tellCount) };
      return 200;
    },
  });
  return { ...view, requests };
};

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

  // A guess here would show Day 1 to a student on Day 4
  it("says it couldn't load, with a way to try again, when the student's list doesn't arrive", async () => {
    let online = false;
    renderToday({
      respond: (config) =>
        config.url === "/MyPage" ? (online ? { status: 200, data: shows(3) } : "offline") : 200,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load today's sentence");
    expect(screen.queryByText("Today's Tell")).not.toBeInTheDocument();
    expect(screen.queryByText("You showed every sentence!")).not.toBeInTheDocument();

    online = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("“Tell 4”")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks for the Tell sentences itself when this browser doesn't have them yet", async () => {
    const { requests } = renderToday({ remembered: 0, mine: shows(1) });

    expect(await screen.findByText("“Tell 2”")).toBeInTheDocument();
    expect(requests).toContain("get /");
  });

  it("doesn't ask for the Tell sentences again when it has them", async () => {
    const { requests } = renderToday();

    await screen.findByText("“Tell 1”");
    expect(requests).toEqual(["get /MyPage"]);
  });

  // No Tell sentences at all must not read as "you've written them all"
  it("says it couldn't load, not 'all done', when the Tell sentences don't arrive", async () => {
    renderToday({
      remembered: 0,
      respond: (config) => (config.url === "/MyPage" ? { status: 200, data: [] } : "offline"),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load today's sentence");
    expect(screen.queryByText("You showed every sentence!")).not.toBeInTheDocument();
  });

  it("says so when every Tell sentence has been written for, and points to Collections", async () => {
    renderToday({ tellCount: 2, mine: shows(2) });

    expect(await screen.findByText("You showed every sentence!")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start showing" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the class gallery" })).toHaveAttribute("href", "/Collections");
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

  it("says where each sentence stands: done, try again, or being checked", async () => {
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
    expect(first).toHaveTextContent("Done · in the gallery");
    expect(first).toHaveClass("paper-note--done");
    expect(second).toHaveTextContent("Try again");
    expect(second).toHaveClass("paper-note--retry");
    expect(third).toHaveTextContent("Scribbles is checking…");
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

  it("tells a student with a sentence being checked to come back later, with Scribbles thinking it over", async () => {
    renderToday({ mine: shows(1) });
    await screen.findByText("“Tell 2”");

    expect(
      screen.getByText("Come back later! Once your teacher approves it, it will appear in the gallery.")
    ).toBeInTheDocument();
    const scribbles = screen.getByRole("img", { name: "Scribbles the pencil" });
    expect(scribbles).toHaveClass("scribbles--thinking");
    expect(scribbles.querySelector('[data-held="note"]')).not.toBeNull();
  });

  it("doesn't say 'come back later' when nothing is being checked", async () => {
    renderToday({ mine: [...shows(1, { approved: true }), { ...shows(2)[1], toRedo: true }] });
    await screen.findByText("“Tell 3”");

    expect(screen.queryByText(/Come back later/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Scribbles the pencil" })).toHaveClass("scribbles--idle");
  });

  it("brings Scribbles along", async () => {
    renderToday();

    expect(await screen.findByRole("img", { name: "Scribbles the pencil" })).toBeInTheDocument();
  });
});
