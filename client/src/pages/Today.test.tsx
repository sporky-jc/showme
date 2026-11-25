import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import Today from "./Today";
import { renderWithApp } from "../test/testUtils";
import type { Outcome, Respond } from "../test/testUtils";
import type { Sentence, TellSentence } from "../api/types";

// Today: a signed-in student's home. The next Tell sentence is the one after
// their last sentence, with the way to start writing and where their latest
// sentences stand.

const ada = { firstName: "Ada", isAdmin: false };

// Tell sentences "Tell 1".."Tell N" for days 1..N
const tells = (n: number): TellSentence[] =>
  Array.from({ length: n }, (_, i) => ({
    key: i + 1,
    id: `day${i + 1}`,
    technique: "senses",
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
  coach = true,
  who = ada,
}: {
  // The signed-in student (with an id, approvals can be celebrated)
  who?: { id?: string; firstName: string; isAdmin: boolean };
  // The senseCoach feature (see features.ts), on unless a test turns it off
  coach?: boolean;
  tellCount?: number;
  remembered?: number;
  mine?: Sentence[];
  answer?: Promise<Outcome>;
  respond?: Respond;
} = {}) => {
  const requests: string[] = [];
  const view = renderWithApp(<Today />, {
    state: { user: who, tellsentences: tells(remembered), features: { senseHighlights: false, senseCoach: coach } },
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

// The sentence notes in "My sentences" (not its "See all" link)
const notes = () =>
  within(within(screen.getByRole("region", { name: "My sentences" })).getByRole("list")).getAllByRole("link");

describe("Today", () => {
  it("greets the student by first name", async () => {
    renderToday();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Hi Ada!");
  });

  it("shows Day 1's Tell sentence to a student who hasn't written yet", async () => {
    renderToday();

    expect(await screen.findByText("“Tell 1”")).toBeInTheDocument();
    expect(screen.getByText("Your next Tell")).toBeInTheDocument();
    expect(document.querySelector(".paper-today__photo")).toHaveAttribute("src", "/day1.jpg");
  });

  it("moves on to the Tell sentence after the student's last one", async () => {
    renderToday({ mine: shows(3) });

    expect(await screen.findByText("“Tell 4”")).toBeInTheDocument();
    expect(document.querySelector(".paper-today__photo")).toHaveAttribute("src", "/day4.jpg");
  });

  // The day comes from the titles, not how many there are: a list with a
  // gap would otherwise offer a day already written
  it("moves on to the day after the latest one written, past a gap", async () => {
    const [day1, , day3] = shows(3);
    renderToday({ mine: [day1, day3] });

    expect(await screen.findByText("“Tell 4”")).toBeInTheDocument();
  });

  it("shows each latest sentence's own stored Tell", async () => {
    const [day1] = shows(1);
    renderToday({ mine: [{ ...day1, title: "day5", tell: "Stored Tell" }] });

    await screen.findByText("“Tell 6”");
    expect(screen.getByText("for “Stored Tell”")).toBeInTheDocument();
  });

  it("'Start showing' leads to the Write page", async () => {
    renderToday();

    expect(await screen.findByRole("link", { name: "Start showing" })).toHaveAttribute("href", "/Write");
  });

  it("a sentence the teacher sent back opens ready to rewrite; the others open My sentences", async () => {
    const mine = shows(2);
    mine[1].toRedo = true;
    renderToday({ mine });

    await waitFor(() => expect(notes()).toHaveLength(2));
    // Newest first
    expect(notes()[0]).toHaveAttribute("href", "/Write/s2");
    expect(notes()[1]).toHaveAttribute("href", "/MySentences");
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

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your next sentence");
    expect(screen.queryByText("Your next Tell")).not.toBeInTheDocument();
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

  it("asks for the Tell sentences again when this browser saved them before Tells had ids", async () => {
    // As an older version of the site saved them: no id, no technique
    const old = tells(12).map((tell) => ({ key: tell.key, title: tell.title, tell: tell.tell, image: tell.image }));
    const requests: string[] = [];
    renderWithApp(<Today />, {
      state: { user: ada, tellsentences: old as TellSentence[] },
      respond: (config) => {
        requests.push(`${config.method} ${config.url}`);
        if (config.url === "/MyPage") return { status: 200, data: shows(1) };
        if (config.url === "/") return { status: 200, data: tells(12) };
        return 200;
      },
    });

    expect(await screen.findByText("“Tell 2”")).toBeInTheDocument();
    expect(requests).toContain("get /");
  });

  it("shows what a Tell asks for as a badge, not in the Tell's words", async () => {
    const list = tells(3);
    list[1] = { ...list[1], technique: "simile", tell: "He dodged all the traps with ease. (Use a Simile)" };
    renderWithApp(<Today />, {
      state: { user: ada, tellsentences: list },
      respond: (config) => (config.url === "/MyPage" ? { status: 200, data: shows(1) } : 200),
    });

    expect(await screen.findByText("“He dodged all the traps with ease.”")).toBeInTheDocument();
    expect(screen.getByText("This Tell asks for a simile")).toBeInTheDocument();
    expect(screen.queryByText(/Use a Simile/)).not.toBeInTheDocument();
    // One ask, not two: the hint says the same as the badge
    expect(screen.getByText("Show it with a simile.")).toBeInTheDocument();
    expect(screen.queryByText("Show it with what you see, hear and feel.")).not.toBeInTheDocument();
  });

  it("has no badge for a Tell that asks for the senses", async () => {
    renderToday();

    await screen.findByText("“Tell 1”");
    expect(screen.queryByText(/This Tell asks for/)).not.toBeInTheDocument();
  });

  // No Tell sentences at all must not read as "you've written them all"
  it("says it couldn't load, not 'all done', when the Tell sentences don't arrive", async () => {
    renderToday({
      remembered: 0,
      respond: (config) => (config.url === "/MyPage" ? { status: 200, data: [] } : "offline"),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your next sentence");
    expect(screen.queryByText("You showed every sentence!")).not.toBeInTheDocument();
  });

  it("says so when every Tell sentence has been written for, and points to the gallery", async () => {
    renderToday({ tellCount: 2, mine: shows(2) });

    expect(await screen.findByText("You showed every sentence!")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start showing" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the gallery" })).toHaveAttribute("href", "/Gallery");
  });

  it("lists the three latest sentences, newest first, each linked to My sentences", async () => {
    renderToday({ mine: shows(5) });
    await screen.findByText("“Tell 6”");

    expect(notes().map((note) => note.querySelector(".paper-note__show")?.textContent)).toEqual([
      "Show 5",
      "Show 4",
      "Show 3",
    ]);
    notes().forEach((note) => expect(note).toHaveAttribute("href", "/MySentences"));
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
      screen.getByText("Come back later! Once Scribbles approves it, it will appear in the Show ME gallery.")
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

  it("has no sense tip when the sense coach is off", async () => {
    renderToday({ coach: false });
    await screen.findByText("“Tell 1”");

    expect(document.querySelector(".paper-today__tip")).toBeNull();
    expect(screen.queryByText(/Try See today/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start showing/ })).toBeInTheDocument();
  });

  it("links to all of the student's sentences, and keeps the sense tip under the button", async () => {
    renderToday({ mine: shows(2) });
    await screen.findByText("“Tell 3”");

    const all = await screen.findByRole("link", { name: /^See all/ });
    expect(all).toHaveAttribute("href", "/MySentences");
    // Start showing comes before the tip, so it stays on a phone's first screen
    const start = screen.getByRole("link", { name: /Start showing/ });
    const tip = document.querySelector(".paper-today__tip")!;
    expect(start.compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no sticker book", async () => {
    renderToday({ mine: shows(1, { approved: true }) });
    await screen.findByText("“Tell 2”");
    expect(screen.queryByRole("region", { name: "Sticker book" })).not.toBeInTheDocument();
    expect(document.querySelector(".paper-sticker")).toBeNull();
  });

  it("tips the student to try the sense they haven't used yet", async () => {
    const mine = shows(4, { approved: true });
    mine[0] = { ...mine[0], show: "His tail thumped like a drum and he licked my salty cheek." };
    mine[1] = { ...mine[1], show: "Rain drummed on the roof and the bright window fogged up." };
    renderToday({ mine });

    // Day 5 is next, so it's Smell's third question
    expect(await screen.findByText("Try Smell today!")).toBeInTheDocument();
    const tip = screen.getByText("Try Smell today!").closest("p");
    expect(tip).toHaveTextContent("Try Smell today! What does the smell remind you of?");
    expect(tip).toHaveClass("paper-today__tip");
  });

  it("tips the sense used least once every sense has been tried", async () => {
    const mine = shows(2, { approved: true });
    // Every sense once, then everything but Feel again
    mine[0] = { ...mine[0], show: "Bright snow crunched, the smoky air tasted sour and stung my nose." };
    mine[1] = { ...mine[1], show: "The bright fire crackled and smoky marshmallows tasted sweet." };
    renderToday({ mine });

    // Day 3 is next, so it's Feel's first question
    const tip = (await screen.findByText("You use Feel the least. Try it today!")).closest("p");
    expect(tip).toHaveTextContent("You use Feel the least. Try it today! What does it feel like on your skin?");
  });

  it("starts a brand new student with See", async () => {
    renderToday();

    const tip = (await screen.findByText("Try See today!")).closest("p");
    expect(tip).toHaveTextContent("Try See today! Zoom in close. What is the smallest thing you can see?");
  });

  it("has no tip once every Tell sentence has been written for", async () => {
    renderToday({ tellCount: 2, mine: shows(2) });

    await screen.findByText("You showed every sentence!");
    expect(document.querySelector(".paper-today__tip")).toBeNull();
  });

  it("brings Scribbles along", async () => {
    renderToday();

    expect(await screen.findByRole("img", { name: "Scribbles the pencil" })).toBeInTheDocument();
  });

  describe("a sentence new to the gallery", () => {
    const maya = { id: "g1", firstName: "Maya", isAdmin: false };
    const seenKey = "showme:seen-approved:g1";
    beforeEach(() => window.localStorage.clear());

    it("is celebrated the first time: a line to the gallery, a stamp on its note, and Scribbles cheers", async () => {
      window.localStorage.setItem(seenKey, JSON.stringify(["s1"]));
      const mine = shows(2, { approved: true });
      renderToday({ who: maya, mine });

      expect(await screen.findByText("Yay! Your sentence is in the gallery!")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "See it in the gallery" })).toHaveAttribute("href", "/Gallery");
      // Newest first: day 2 is the new one
      expect(notes()[0]).toHaveClass("paper-note--fresh");
      expect(notes()[0].querySelector(".paper-joined-stamp")).toHaveAttribute("aria-hidden", "true");
      expect(notes()[1]).not.toHaveClass("paper-note--fresh");
      expect(document.querySelector(".scribbles--cheer")).not.toBeNull();
    });

    it("is not celebrated again on the next visit", async () => {
      window.localStorage.setItem(seenKey, JSON.stringify(["s1"]));
      const mine = shows(2, { approved: true });
      const first = renderToday({ who: maya, mine });
      await screen.findByText("Yay! Your sentence is in the gallery!");
      first.unmount();

      renderToday({ who: maya, mine });
      await waitFor(() => expect(notes()).toHaveLength(2));
      expect(screen.queryByText(/Yay!/)).not.toBeInTheDocument();
      expect(document.querySelector(".paper-note--fresh")).toBeNull();
      expect(document.querySelector(".scribbles--cheer")).toBeNull();
    });

    it("isn't celebrated the first time this browser sees the student, so old approvals stay quiet", async () => {
      renderToday({ who: maya, mine: shows(2, { approved: true }) });

      await waitFor(() => expect(notes()).toHaveLength(2));
      expect(screen.queryByText(/Yay!/)).not.toBeInTheDocument();
    });
  });
});
