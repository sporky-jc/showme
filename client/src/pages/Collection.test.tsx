import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Collection from "./Collection";
import type { UserEvent } from "@testing-library/user-event";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";
import type { SentenceWithAuthor } from "../api/types";

// The Show ME gallery (the Collections page): what a visitor sees.

const tellsentences = [{ key: 1, id: "day1", technique: "senses" as const, title: "Day 1", tell: "It is cold outside.", image: "/cold.jpg" }];

// Approved sentences, newest first (the order the server sends them in)
const fromServer = (n: number): SentenceWithAuthor[] =>
  Array.from({ length: n }, (_, i) => ({
    _id: `id-${i + 1}`,
    title: "day1",
    tell: "It is cold outside.",
    show: `Sentence ${i + 1}`,
    approved: true,
    toRedo: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    author: { firstName: "Ada", lastName: "Lovelace" },
  }));

const shownOrder = () => screen.queryAllByText(/^Sentence \d+$/).map((el) => el.textContent);

// `server`: the list the server sends, or a function giving each answer in turn
// (a status, "offline", or { status, data })
const renderCollection = ({
  server = fromServer(6),
  remembered = [],
  lit = true,
}: {
  server?: SentenceWithAuthor[] | ((call: number) => Outcome);
  remembered?: SentenceWithAuthor[];
  // The senseHighlights feature (see features.ts)
  lit?: boolean;
} = {}) => {
  let calls = 0;
  return renderWithApp(<Collection />, {
    // `remembered`: an old list redux-persist may have restored
    state: { tellsentences, approvedsentences: remembered, features: { senseHighlights: lit, senseCoach: false } },
    route: "/Collections",
    respond: (config) => {
      if (config.url !== "/Collections") return 200;
      calls += 1;
      return typeof server === "function" ? server(calls) : { status: 200, data: server };
    },
  });
};

// The two orders, in a group of their own
const order = (name: "Shuffle" | "Newest") =>
  within(screen.getByRole("group", { name: "Order" })).getByRole("button", { name });
const pickSort = (user: UserEvent, choice: "Shuffle" | "Newest") => user.click(order(choice));

afterEach(() => {
  delete window.earlyRequests;
});

describe("Collection", () => {
  it("shows the approved sentences from the server", async () => {
    renderCollection({ server: fromServer(6) });

    await waitFor(() => expect(shownOrder()).toHaveLength(6));
    expect(shownOrder().sort()).toEqual(fromServer(6).map((s) => s.show).sort());
  });

  it("shows the sentences index.html already asked for, without asking again", async () => {
    // On a fresh load, index.html starts this request before the app's code
    // arrives (see vite.config.ts). The app's own request would fail here.
    window.earlyRequests = {
      "/Collections": Promise.resolve(
        { ok: true, status: 200, json: async () => fromServer(4) } as Partial<Response> as Response
      ),
    };
    renderCollection({ server: () => "offline" });

    await waitFor(() => expect(shownOrder()).toHaveLength(4));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the fresh list from the server, not an old one remembered by the browser", async () => {
    const old = [{ ...fromServer(1)[0], _id: "old", show: "Sentence 99" }];
    renderCollection({ server: fromServer(3), remembered: old });

    await waitFor(() => expect(shownOrder()).toHaveLength(3));
    expect(screen.queryByText("Sentence 99")).not.toBeInTheDocument();
  });

  it("starts shuffled, and Newest shows the server's newest-first order", async () => {
    const user = userEvent.setup();
    renderCollection({ server: fromServer(6) });
    await waitFor(() => expect(shownOrder()).toHaveLength(6));
    expect(order("Shuffle")).toHaveAttribute("aria-pressed", "true");
    expect(order("Newest")).toHaveAttribute("aria-pressed", "false");

    await pickSort(user, "Newest");

    expect(order("Newest")).toHaveAttribute("aria-pressed", "true");
    expect(order("Shuffle")).toHaveAttribute("aria-pressed", "false");

    await waitFor(() =>
      expect(shownOrder()).toEqual(fromServer(6).map((s) => s.show))
    );
  });

  it("Shuffle keeps the same sentences, in some order", async () => {
    const user = userEvent.setup();
    renderCollection({ server: fromServer(6) });
    await waitFor(() => expect(shownOrder()).toHaveLength(6));

    await pickSort(user, "Newest");
    await pickSort(user, "Shuffle");

    await waitFor(() => expect(shownOrder()).toHaveLength(6));
    expect(shownOrder().sort()).toEqual(fromServer(6).map((s) => s.show).sort());
  });

  it("says so, with a Try again button, when the gallery can't be loaded", async () => {
    renderCollection({ server: () => "offline" });

    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent(/couldn't load the gallery/i);
    expect(within(message).getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(shownOrder()).toHaveLength(0);
  });

  it("Try again loads the gallery again", async () => {
    const user = userEvent.setup();
    renderCollection({ server: (call) => (call === 1 ? 500 : { status: 200, data: fromServer(3) }) });

    await user.click(await screen.findByRole("button", { name: /try again/i }));

    await waitFor(() => expect(shownOrder()).toHaveLength(3));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never brings back an old list remembered by the browser when loading fails", async () => {
    const old = [{ ...fromServer(1)[0], _id: "old", show: "Sentence 99" }];
    renderCollection({ server: () => "offline", remembered: old });

    await screen.findByRole("alert");
    expect(screen.queryByText("Sentence 99")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Order" })).not.toBeInTheDocument();
  });

  it("has one heading, and Scribbles saying what the page is", async () => {
    renderCollection();

    await waitFor(() => expect(shownOrder()).toHaveLength(6));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Show ME gallery");
    expect(screen.getByText("Look what everyone made!")).toBeInTheDocument();
    // His speech bubble says it, so he is hidden from screen readers
    expect(screen.queryByRole("img", { name: "Scribbles the pencil" })).not.toBeInTheDocument();
  });

  const wallShows = () =>
    [...document.querySelectorAll(".paper-gallery__show")].map((show) => show.textContent);

  it("has no Scribbles' pick: the cards come first, every sentence among them", async () => {
    const user = userEvent.setup();
    renderCollection({ server: fromServer(15) });
    await screen.findByRole("group", { name: "Order" });
    await pickSort(user, "Newest");

    expect(screen.queryByRole("region", { name: "Scribbles’ pick" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show me another" })).not.toBeInTheDocument();
    expect(wallShows()).toEqual(fromServer(12).map((s) => s.show));
  });

  it("shows every sentence on the wall when there are only a few", async () => {
    const user = userEvent.setup();
    renderCollection({ server: fromServer(4) });
    await screen.findByText("Sentence 1");
    await pickSort(user, "Newest");

    expect(wallShows()).toEqual(["Sentence 1", "Sentence 2", "Sentence 3", "Sentence 4"]);
  });

  // The sense finder: See, Hear, Feel, Smell and Taste show only the wall's
  // sentences that use that sense
  const finder = () => screen.getByRole("group", { name: "Find a sense" });
  const senseButton = (name: string) => within(finder()).getByRole("button", { name });
  const withSenses = (): SentenceWithAuthor[] =>
    ["Rain drummed on the roof.", "The soup smelled of garlic.", "A bell rang twice.", "Sentence 4"].map(
      (show, i) => ({ ...fromServer(4)[i], show })
    );

  it("has no sense finder when sense highlights are off", async () => {
    renderCollection({ server: withSenses(), lit: false });
    await screen.findByText("Sentence 4");

    expect(screen.queryByRole("group", { name: "Find a sense" })).not.toBeInTheDocument();
    expect(document.querySelector("mark")).toBeNull();
  });

  it("finds the sentences that use a sense, and says how many", async () => {
    const user = userEvent.setup();
    renderCollection({ server: [...withSenses(), ...fromServer(12).map((s, i) => ({ ...s, _id: `x-${i}` }))] });
    await screen.findByRole("group", { name: "Find a sense" });
    await pickSort(user, "Newest");

    await user.click(senseButton("Hear"));

    expect(senseButton("Hear")).toHaveAttribute("aria-pressed", "true");
    expect(wallShows()).toEqual(["Rain drummed on the roof.", "A bell rang twice."]);
    expect(screen.getByText("2 sentences you can hear.")).toHaveAttribute("role", "status");
  });

  it("finds a sentence by the words two AI models agreed on, too", async () => {
    const user = userEvent.setup();
    const tagged = { ...withSenses()[3], show: "Wind wailed all night.", senseTags: [{ word: "wailed", sense: "hear" as const }] };
    renderCollection({ server: [...withSenses().slice(0, 3), tagged] });
    await screen.findByRole("group", { name: "Find a sense" });
    await pickSort(user, "Newest");

    await user.click(senseButton("Hear"));

    expect(wallShows()).toContain("Wind wailed all night.");
  });

  it("shows them all again when the sense is pressed again", async () => {
    const user = userEvent.setup();
    renderCollection({ server: withSenses() });
    await screen.findByRole("group", { name: "Find a sense" });
    await pickSort(user, "Newest");
    const before = wallShows();

    await user.click(senseButton("Smell"));
    await user.click(senseButton("Smell"));

    expect(senseButton("Smell")).toHaveAttribute("aria-pressed", "false");
    expect(wallShows()).toEqual(before);
  });

  it("only one sense at a time", async () => {
    const user = userEvent.setup();
    renderCollection({ server: withSenses() });
    await screen.findByRole("group", { name: "Find a sense" });

    await user.click(senseButton("Hear"));
    await user.click(senseButton("Smell"));

    expect(senseButton("Hear")).toHaveAttribute("aria-pressed", "false");
    expect(senseButton("Smell")).toHaveAttribute("aria-pressed", "true");
  });

  it("says so when no sentence uses the sense, with a way back to all of them", async () => {
    const user = userEvent.setup();
    renderCollection({ server: withSenses() });
    await screen.findByRole("group", { name: "Find a sense" });

    await user.click(senseButton("Taste"));

    expect(screen.getByText("No sentences you can taste yet.")).toBeInTheDocument();
    expect(wallShows()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(senseButton("Taste")).toHaveAttribute("aria-pressed", "false");
    expect(wallShows()).toHaveLength(4);
  });

  it("has no sense finder without sentences", async () => {
    renderCollection({ server: [] });
    await screen.findByText(/No sentences have been approved yet/);

    expect(screen.queryByRole("group", { name: "Find a sense" })).not.toBeInTheDocument();
  });

  // The end of the wall: Show more, then Scribbles' invite for visitors
  it("Show more shows the next 12, and the keyboard goes to the first new card", async () => {
    const user = userEvent.setup();
    renderCollection({ server: fromServer(30) });
    await screen.findByRole("button", { name: "Show more" });
    await pickSort(user, "Newest");
    expect(wallShows()).toHaveLength(12);
    expect(screen.getByText("Showing 12 of 30 sentences.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show more" }));

    expect(wallShows()).toHaveLength(24);
    expect(wallShows()[12]).toBe("Sentence 13");
    expect(document.activeElement?.textContent).toContain("Sentence 13");
    expect(screen.getByText("Showing 24 of 30 sentences.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show more" }));

    expect(wallShows()).toHaveLength(30);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect(screen.getByText("Showing all 30 sentences.")).toBeInTheDocument();
  });

  it("has no Show more when every sentence fits", async () => {
    renderCollection({ server: fromServer(6) });
    await screen.findByText("Sentence 6");

    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
  });

  it("starts from 12 again with a new order", async () => {
    const user = userEvent.setup();
    renderCollection({ server: fromServer(30) });
    await user.click(await screen.findByRole("button", { name: "Show more" }));

    await pickSort(user, "Newest");

    expect(wallShows()).toHaveLength(12);
  });

  it("invites a visitor to write one, with a button that isn't another Sign in", async () => {
    renderCollection({ server: fromServer(3) });
    const invite = await screen.findByRole("region", { name: "I tape up the best ones" });

    expect(within(invite).getByRole("button", { name: "Write one too" })).toBeInTheDocument();
    expect(within(invite).queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("says when no sentences have been approved yet", async () => {
    renderCollection({ server: [] });

    expect(await screen.findByText(/no sentences have been approved yet/i)).toBeInTheDocument();
  });
});
