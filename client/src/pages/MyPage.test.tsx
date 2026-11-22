import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyPage from "./MyPage";
import { OpenLoginContext } from "../components/loginPopup";
import type { InternalAxiosRequestConfig } from "axios";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";
import type { OwnSentence, TellSentence } from "../api/types";

// My sentences: the signed-in student's own sentences, newest first, each
// with where it stands and the way to change it.

const ada = { id: "g-ada", firstName: "Ada", lastName: "Lovelace" };

// Tell sentences "Tell 1".."Tell N" for days 1..N
const tells = (n: number): TellSentence[] =>
  Array.from({ length: n }, (_, i) => ({
    key: i + 1,
    title: `Day ${i + 1}`,
    tell: `Tell ${i + 1}`,
    image: `/day${i + 1}.jpg`,
  }));

// The student's own sentences for days 1..n ("Show 1".."Show n")
const shows = (n: number): OwnSentence[] =>
  Array.from({ length: n }, (_, i) => ({
    _id: `s${i + 1}`,
    title: `day${i + 1}`,
    tell: `Tell ${i + 1}`,
    show: `Show ${i + 1}`,
    hideedit: true,
    approved: false,
    toRedo: false,
    createdAt: "2026-10-01T00:00:00.000Z",
  }));

// Draw My sentences for a signed-in Ada. The pretend server answers GET
// /MyPage with `mine` (or with `answer`, to hold it back or fail).
const renderMyPage = ({
  tellCount = 12,
  mine = shows(2),
  answer,
}: { tellCount?: number; mine?: OwnSentence[]; answer?: () => Outcome | Promise<Outcome> } = {}) => {
  const requests: InternalAxiosRequestConfig[] = [];
  const view = renderWithApp(<MyPage />, {
    state: { user: ada, tellsentences: tells(tellCount), usersentences: [] },
    respond: (config) => {
      requests.push(config);
      if (config.method === "get" && config.url === "/MyPage") {
        return answer ? answer() : { status: 200, data: mine };
      }
      return 200;
    },
    route: "/MyPage",
  });
  return { ...view, requests };
};

const listedShows = () => screen.queryAllByText(/^Show \d+$/).map((el) => el.textContent);
const note = (show: string) => screen.getByText(show).closest("li")!;

describe("My sentences", () => {
  it("asks a visitor who isn't signed in to sign in, instead of showing an empty page", async () => {
    const openLogin = vi.fn();
    const requests: InternalAxiosRequestConfig[] = [];
    renderWithApp(
      <OpenLoginContext.Provider value={openLogin}>
        <MyPage />
      </OpenLoginContext.Provider>,
      {
        state: { user: {}, tellsentences: tells(12), usersentences: [] },
        route: "/MyPage",
        respond: (config) => {
          requests.push(config);
          return 401;
        },
      }
    );

    expect(screen.getByText(/sign in to write your own sentences/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(openLogin).toHaveBeenCalledTimes(1);
    // There's nobody to fetch sentences for, so the server isn't asked
    expect(requests).toHaveLength(0);
  });

  it("lists the student's sentences, newest first, each with its day and Tell sentence", async () => {
    renderMyPage({ mine: shows(3) });

    await waitFor(() => expect(listedShows()).toEqual(["Show 3", "Show 2", "Show 1"]));
    expect(within(note("Show 3")).getByText("Sentence 3")).toBeInTheDocument();
    expect(within(note("Show 3")).getByText("Tell 3")).toBeInTheDocument();
  });

  // Numbered by the day in their titles, not their place in the list. An
  // older sentence whose title isn't a day gets no number: its place could
  // be another sentence's day.
  it("numbers each sentence by its day, and an older one without a day not at all", async () => {
    const [first, second] = shows(2);
    renderMyPage({
      mine: [
        { ...first, title: "Day 1", show: "Old one" },
        { ...second, title: "day1", show: "Show 1", tell: "Stored Tell" },
      ],
    });

    await screen.findByText("Old one");
    expect(within(note("Show 1")).getByText("Sentence 1")).toBeInTheDocument();
    expect(within(note("Show 1")).getByText("Stored Tell")).toBeInTheDocument();
    expect(within(note("Old one")).getByText("Sentence")).toBeInTheDocument();
    expect(screen.getAllByText(/^Sentence \d+$/)).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Edit: sentence 1" })).toHaveAttribute("href", "/Write/s2");
    expect(screen.getByRole("link", { name: "Edit: sentence “Old one”" })).toHaveAttribute("href", "/Write/s1");
  });

  it("says where each sentence stands", async () => {
    const mine = shows(3);
    mine[0].approved = true;
    mine[1].toRedo = true;
    renderMyPage({ mine });

    await screen.findByText("Show 1");
    expect(within(note("Show 1")).getByText("Done · in the gallery")).toBeInTheDocument();
    expect(within(note("Show 2")).getByText("Try again", { selector: ".paper-note__status" })).toBeInTheDocument();
    expect(within(note("Show 3")).getByText("Scribbles is checking…")).toBeInTheDocument();
  });

  // The old pencil only appeared under a mouse, so never on a phone
  it("every sentence has a link to change it on the Write page; one sent back says Try again", async () => {
    const mine = shows(2);
    mine[1].toRedo = true;
    renderMyPage({ mine });

    expect(await screen.findByRole("link", { name: "Edit: sentence 1" })).toHaveAttribute("href", "/Write/s1");
    expect(screen.getByRole("link", { name: "Try again: sentence 2" })).toHaveAttribute("href", "/Write/s2");
  });

  it("shows the senses each sentence uses as stickers, said in words for screen readers", async () => {
    const mine = shows(2);
    mine[0] = { ...mine[0], show: "His tail thumped and he licked my salty cheek." };
    renderMyPage({ mine });

    const row = (await screen.findByText(mine[0].show)).closest("li")!;
    expect(row.querySelectorAll(".paper-sticker")).toHaveLength(3);
    expect(row).toHaveTextContent("Senses: Hear (thumped), Feel (licked), Taste (salty)");
    // A sentence without a sense word gets no row of stickers
    expect(note("Show 2").querySelector(".paper-mine__senses")).toBeNull();
  });

  it("offers the next sentence while there is one left to write", async () => {
    renderMyPage({ tellCount: 3, mine: shows(2) });

    expect(await screen.findByRole("link", { name: "Write your next sentence" })).toHaveAttribute("href", "/Write");
  });

  it("doesn't offer writing when every day is done", async () => {
    renderMyPage({ tellCount: 2, mine: shows(2) });

    await screen.findByText("Show 2");
    expect(screen.queryByRole("link", { name: "Write your next sentence" })).not.toBeInTheDocument();
  });

  it("with nothing written yet, says so", async () => {
    renderMyPage({ mine: [] });

    expect(await screen.findByText(/haven't written a sentence yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Write your next sentence" })).toBeInTheDocument();
  });

  it("shows 8 sentences per page, with page buttons when there are more", async () => {
    const user = userEvent.setup();
    renderMyPage({ mine: shows(10) });

    await waitFor(() =>
      expect(listedShows()).toEqual([
        "Show 10", "Show 9", "Show 8", "Show 7", "Show 6", "Show 5", "Show 4", "Show 3",
      ])
    );
    const pager = screen.getByRole("navigation", { name: "Pages" });
    expect(within(pager).getAllByRole("button")).toHaveLength(2);
    expect(within(pager).getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");

    await user.click(within(pager).getByRole("button", { name: "Page 2" }));

    await waitFor(() => expect(listedShows()).toEqual(["Show 2", "Show 1"]));
    // The edit link still belongs to the right day on the second page
    expect(screen.getByRole("link", { name: "Edit: sentence 2" })).toHaveAttribute("href", "/Write/s2");
  });

  it("has no page buttons for a single page", async () => {
    renderMyPage({ mine: shows(8) });

    await screen.findByText("Show 8");
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });

  it("when the list can't be loaded, says so and loads it on Try again", async () => {
    const user = userEvent.setup();
    let online = false;
    renderMyPage({
      mine: shows(1),
      answer: () => (online ? { status: 200, data: shows(1) } : "offline"),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your sentences/i);
    // A message-only state still has the page's name as a heading
    expect(screen.getByRole("heading", { level: 1, name: "My sentences" })).toBeInTheDocument();
    online = true;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Show 1")).toBeInTheDocument();
  });

  it("shows the tip that came with Try again, and the praise once approved, in Scribbles' words", async () => {
    const [first, second, third] = shows(3);
    renderMyPage({
      mine: [
        { ...first, approved: true, tip: { id: "great", text: "Great picture! Keep painting with words." } },
        { ...second, toRedo: true, tip: { id: "spelling", text: "Check your spelling. Read each word slowly, letter by letter." } },
        third,
      ],
    });

    expect(await screen.findByText("Check your spelling. Read each word slowly, letter by letter.")).toBeInTheDocument();
    expect(screen.getByText("Scribbles\u2019 tip")).toBeInTheDocument();
    expect(screen.getByText("Great picture! Keep painting with words.")).toBeInTheDocument();
    expect(screen.getByText("Scribbles says")).toBeInTheDocument();
    // A sentence still waiting has no tip
    expect(document.querySelectorAll(".paper-mine__tip")).toHaveLength(2);
  });
});
