import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import Write from "./Write";
import { OpenLoginContext } from "../components/loginPopup";
import type { InternalAxiosRequestConfig } from "axios";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";
import type { Sentence, Technique, TellSentence } from "../api/types";

// The Write page: today's Tell sentence, a box to show it in, Scribbles'
// questions for each sense, and what happens once it's sent. With a
// sentence's id in the address, that sentence is edited.

const ada = { id: "g-ada", firstName: "Ada", lastName: "Lovelace" };

const tells = (n: number): TellSentence[] =>
  Array.from({ length: n }, (_, i) => ({
    key: i + 1,
    id: `day${i + 1}`,
    technique: "senses",
    title: `Day ${i + 1}`,
    tell: `Tell ${i + 1}`,
    image: `/day${i + 1}.jpg`,
  }));

const shows = (n: number): Sentence[] =>
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

// Draw the Write page at `route` for a signed-in Ada. The pretend server
// answers GET /MyPage with `mine`; `save` answers a POST or PATCH.
const renderWrite = ({
  route = "/Write",
  tellCount = 12,
  tellList,
  student = ada,
  mine = shows(2),
  list,
  save,
  coach = true,
}: {
  // The senseCoach feature (see features.ts), on unless a test turns it off
  coach?: boolean;
  route?: string;
  tellCount?: number;
  tellList?: TellSentence[];
  student?: typeof ada & { seenRefreshers?: Technique[] };
  mine?: Sentence[];
  list?: () => Outcome | Promise<Outcome>;
  save?: () => Outcome | Promise<Outcome>;
} = {}) => {
  const requests: InternalAxiosRequestConfig[] = [];
  const view = renderWithApp(
    <Routes>
      <Route path="/Write/:id?" element={<Write />} />
      <Route path="*" element={<p>Another page</p>} />
    </Routes>,
    {
      state: {
        user: student,
        tellsentences: tellList ?? tells(tellCount),
        usersentences: [],
        features: { senseHighlights: false, senseCoach: coach },
      },
      route,
      respond: (config) => {
        requests.push(config);
        if (config.url === "/MyPage" && config.method === "get") {
          return list ? list() : { status: 200, data: mine };
        }
        if (config.url === "/MyPage") {
          if (save) return save();
          return { status: 201, data: { _id: "new", ...JSON.parse(config.data) } };
        }
        if (config.url === "/Login") return { status: 200, data: student };
        if (config.url?.startsWith("/Login/refreshers/")) {
          return { status: 200, data: { ...student, seenRefreshers: [...(student.seenRefreshers ?? []), "senses"] } };
        }
        return 200;
      },
    }
  );
  const saves = () => requests.filter((r) => r.url === "/MyPage" && r.method !== "get");
  return { ...view, requests, saves };
};

const box = () => screen.findByLabelText("Now show it");
const sendButton = () => screen.getByRole("button", { name: "Ask Scribbles" });
const bubble = () => document.querySelector(".paper-bubble")!;
// Help (the refresher's button and the sense buttons) sits behind this button
const ideasButton = () => screen.getByRole("button", { name: "Need an idea?" });
const openIdeas = () => act(() => ideasButton().click());

describe("Write", () => {
  it("asks a visitor who isn't signed in to sign in, without asking the server", async () => {
    const openLogin = vi.fn();
    const requests: InternalAxiosRequestConfig[] = [];
    renderWithApp(
      <OpenLoginContext.Provider value={openLogin}>
        <Write />
      </OpenLoginContext.Provider>,
      {
        state: { user: {}, tellsentences: tells(12), usersentences: [] },
        route: "/Write",
        respond: (config) => {
          requests.push(config);
          return 401;
        },
      }
    );

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(openLogin).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(0);
  });

  it("shows what the Tell asks for as a badge, and sends the Tell's own words", async () => {
    const user = userEvent.setup();
    const list = tells(3);
    list[2] = { ...list[2], technique: "metaphor", tell: "The hot soup burned my mouth. (Use a Metaphor)" };
    const { saves } = renderWrite({ mine: shows(2), tellList: list });

    await user.type(await box(), "The soup was lava on my tongue.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your next TellThe hot soup burned my mouth.");
    expect(screen.getByText("This Tell asks for a metaphor")).toBeInTheDocument();

    await user.click(sendButton());
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(JSON.parse(saves()[0].data as string)).toMatchObject({ title: "day3" });
  });

  it("opens the Tell's refresher from its button, and puts the keyboard back on the button after", async () => {
    const user = userEvent.setup();
    const list = tells(3);
    list[2] = { ...list[2], technique: "simile", tell: "He dodged all the traps with ease. (Use a Simile)" };
    renderWrite({ mine: shows(2), tellList: list });
    await box();
    await openIdeas();

    const what = screen.getByRole("button", { name: "What’s a simile?" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(what);

    expect(screen.getByRole("dialog", { name: "What’s a simile?" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(what).toHaveFocus());
  });

  it("offers the senses refresher on a Tell that asks for the senses", async () => {
    renderWrite({ mine: shows(2) });
    await box();
    await openIdeas();

    expect(screen.getByRole("button", { name: "What’s a sense?" })).toBeInTheDocument();
    expect(screen.queryByText(/This Tell asks for/)).not.toBeInTheDocument();
  });

  it("opens the senses refresher by itself the first time, and tells the server it was seen", async () => {
    const { requests } = renderWrite({ mine: [], student: { ...ada, seenRefreshers: [] } });

    expect(await screen.findByRole("dialog", { name: "What’s a sense?" })).toBeInTheDocument();
    await waitFor(() =>
      expect(requests.some((r) => r.method === "put" && r.url === "/Login/refreshers/senses")).toBe(true)
    );
    // The help is open under it, so its button is there when it closes
    await userEvent.keyboard("{Escape}");
    expect(ideasButton()).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: "What’s a sense?" })).toHaveFocus());
  });

  it("doesn't open a refresher by itself once it's been seen", async () => {
    const { requests } = renderWrite({ mine: [], student: { ...ada, seenRefreshers: ["senses"] } });
    await box();
    // Closed until asked for
    expect(ideasButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "What’s a sense?" })).not.toBeInTheDocument();
    await openIdeas();
    expect(ideasButton()).toHaveAttribute("aria-expanded", "true");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What’s a sense?" })).toBeInTheDocument();
    expect(requests.some((r) => r.url?.startsWith("/Login/refreshers/"))).toBe(false);
  });

  it("doesn't open a refresher by itself while editing, or before the server says what's been seen", async () => {
    renderWrite({ route: "/Write/s1", mine: shows(2), student: { ...ada, seenRefreshers: [] } });
    await box();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a new technique's refresher by itself even when the senses one was seen", async () => {
    const list = tells(3);
    list[2] = { ...list[2], technique: "simile", tell: "He dodged all the traps with ease. (Use a Simile)" };
    renderWrite({ mine: shows(2), tellList: list, student: { ...ada, seenRefreshers: ["senses"] } });

    expect(await screen.findByRole("dialog", { name: "What’s a simile?" })).toBeInTheDocument();
  });

  it("shows today's Tell sentence: the one after the student's last", async () => {
    renderWrite({ mine: shows(2) });

    await box();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your next TellTell 3");
    expect(screen.getByRole("link", { name: /Back home/ })).toHaveAttribute("href", "/");
  });

  // The day comes from the list, and a save sent while the list is still on
  // its way can cross with it (QA Wolf, Oct 7). So there is nothing to write
  // in until it has arrived.
  it("offers the box only once the student's list has arrived", async () => {
    let release!: (outcome: Outcome) => void;
    const held = new Promise<Outcome>((resolve) => (release = resolve));
    renderWrite({ list: () => held });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    release({ status: 200, data: shows(2) });

    expect(await box()).toBeInTheDocument();
  });

  it("counts the words and cheers the writer on, without ever blocking a short sentence", async () => {
    const user = userEvent.setup();
    renderWrite();
    const count = () => document.getElementById("show-count")!;

    await box();
    expect(count()).toHaveTextContent("0 words · Don't just tell me. Show me!");
    expect(sendButton()).toBeDisabled();

    await user.type(await box(), "Brr");
    expect(count()).toHaveTextContent("1 word · Keep going, add a detail!");
    expect(sendButton()).toBeEnabled();

    await user.type(await box(), ", my fingers froze to the icy gate today");
    expect(count()).toHaveTextContent("9 words · Nice and vivid!");
    expect(count()).not.toHaveTextContent("left");
  });

  // The server refuses anything longer than 600 characters
  it("stops at 600 characters, and says how many are left near the end", async () => {
    const user = userEvent.setup();
    renderWrite();
    const count = () => document.getElementById("show-count")!;

    expect(await box()).toHaveAttribute("maxLength", "600");
    await user.click(await box());
    await user.paste("a".repeat(560));
    expect(count()).toHaveTextContent("1 word · Keep going, add a detail! · 40 characters left");
    await user.paste("b".repeat(60));
    expect(await box()).toHaveValue("a".repeat(560) + "b".repeat(40));
    expect(count()).toHaveTextContent("0 characters left");
  });

  it("pressing a sense makes Scribbles ask about it; pressing it again asks something else", async () => {
    const user = userEvent.setup();
    renderWrite();
    await box();
    expect(bubble()).toHaveTextContent("Stuck? Tap “Need an idea?” and I'll help you think!");
    await openIdeas();

    const hear = screen.getByRole("button", { name: "Hear" });
    expect(hear).toHaveAttribute("aria-pressed", "false");
    await user.click(hear);
    expect(hear).toHaveAttribute("aria-pressed", "true");
    const first = bubble().textContent;
    expect(first).toMatch(/sounds/);

    await user.click(hear);
    expect(bubble().textContent).not.toBe(first);

    await user.click(screen.getByRole("button", { name: "Smell" }));
    expect(hear).toHaveAttribute("aria-pressed", "false");
    expect(bubble()).toHaveTextContent(/sniff/);
    // The senses never send the sentence
    expect(screen.getByRole("button", { name: "Smell" })).toHaveAttribute("type", "button");
  });

  it("has no sense buttons or sense hints when the sense coach is off", async () => {
    const user = userEvent.setup();
    renderWrite({ coach: false });
    const field = await box();
    expect(bubble()).toHaveTextContent("Write your sentence. I'll try to picture it!");
    await user.type(field, "His tail thumped the floor like a drum and he licked my salty cheek.");

    expect(screen.queryByRole("group", { name: "Senses" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hear" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Tap a sense/)).not.toBeInTheDocument();
    // Scribbles praises a full sentence without counting senses
    expect(bubble()).toHaveTextContent("I can picture it!");
    expect(bubble()).not.toHaveTextContent("senses");
    // Sending still works the same
    expect(screen.getByRole("button", { name: "Ask Scribbles" })).toBeEnabled();
  });

  it("still warns about the Tell word when the sense coach is off", async () => {
    const user = userEvent.setup();
    const mine = shows(2);
    mine[0].tell = "The dog was happy.";
    renderWrite({ route: "/Write/s1", mine, coach: false });
    const input = await box();

    await user.clear(input);
    await user.type(input, "His tail thumped the floor because he was happy");
    expect(bubble()).toHaveTextContent("“happy” is the Tell word. Can you show it instead?");
  });

  it("lights up the senses the sentence uses, and keeps their names", async () => {
    const user = userEvent.setup();
    renderWrite();
    await user.type(await box(), "His tail thumped the floor like a drum and he licked my salty cheek.");
    await openIdeas();

    const hear = screen.getByRole("button", { name: "Hear" });
    expect(hear).toHaveAccessibleDescription("Used: thumped");
    expect(screen.getByRole("button", { name: "Feel" })).toHaveAccessibleDescription("Used: licked");
    expect(screen.getByRole("button", { name: "Taste" })).toHaveAccessibleDescription("Used: salty");
    expect(screen.getByRole("button", { name: "See" })).not.toHaveAccessibleDescription();
    // Using a sense isn't pressing it: pressed is the one Scribbles asks about
    expect(hear).toHaveAttribute("aria-pressed", "false");

    // No stickers on the picture
    expect(document.querySelector(".paper-sticker")).toBeNull();
    expect(bubble()).toHaveTextContent("I can picture it! You used 3 senses.");
  });

  it("doesn't praise a sentence that only tells, even when sense words hide inside other words", async () => {
    const user = userEvent.setup();
    renderWrite();
    await user.type(await box(), "He was tired and bored and seemed furious today");
    await openIdeas();

    for (const name of ["See", "Hear", "Feel", "Smell", "Taste"]) {
      expect(screen.getByRole("button", { name })).not.toHaveAccessibleDescription();
    }
    expect(bubble()).toHaveTextContent("I see shapes, but no details yet. What would you see or hear?");
  });

  it("asks for a second sense, and says when the Tell word is back", async () => {
    const user = userEvent.setup();
    const mine = shows(2);
    mine[0].tell = "The dog was happy.";
    renderWrite({ route: "/Write/s1", mine });
    const input = await box();

    await user.clear(input);
    await user.type(input, "His tail thumped the floor again and again and again");
    expect(bubble()).toHaveTextContent("Ooh, getting there! Can you add a second sense?");

    await user.type(input, " because he was happy");
    expect(bubble()).toHaveTextContent("“happy” is the Tell word. Can you show it instead?");
  });

  it("brings back Scribbles' thoughts on the sentence once the student types after asking", async () => {
    const user = userEvent.setup();
    renderWrite();
    const input = await box();
    await openIdeas();
    await user.click(screen.getByRole("button", { name: "Smell" }));
    expect(bubble()).toHaveTextContent(/sniff/);

    await user.type(input, "Smoke");
    expect(bubble()).toHaveTextContent("It's getting clearer! Add a detail.");
    // The sense stays pressed, so pressing it again asks its next question
    expect(screen.getByRole("button", { name: "Smell" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the day's photo clear from the start: small by the Tell, and in its frame", async () => {
    const user = userEvent.setup();
    renderWrite();
    await box();
    // Both are here; paper.css shows the small one on a phone, the framed one on a wide screen
    const photos = [
      document.querySelector<HTMLImageElement>(".paper-write__thumb")!,
      document.querySelector<HTMLImageElement>(".paper-write__photo")!,
    ];
    for (const photo of photos) {
      expect(photo).toHaveAttribute("src", "/day3.jpg");
      expect(photo).toHaveAttribute("alt", "");
      expect(photo.style.filter).toBe("");
    }

    await user.type(await box(), "Bright snow crunched under my boots and stung my cold cheeks");
    for (const photo of photos) expect(photo.style.filter).toBe("");
  });

  it("has no step chips, and keeps the button right after the writing box", async () => {
    renderWrite();
    const input = await box();

    expect(screen.queryByRole("list", { name: "Steps" })).not.toBeInTheDocument();
    expect(screen.queryByText("2 · Scribbles checks")).not.toBeInTheDocument();
    // In the page's order, the button comes right after the box, before the senses
    const send = screen.getByRole("button", { name: "Ask Scribbles" });
    await openIdeas();
    const senses = screen.getByRole("group", { name: "Senses" });
    expect(input.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(send.compareDocumentPosition(senses) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sending saves the sentence for the right day, then says Scribbles is checking", async () => {
    const user = userEvent.setup();
    const { saves } = renderWrite({ mine: shows(2) });

    await user.type(await box(), "Brr, my fingers froze.");
    await user.click(sendButton());

    const heading = await screen.findByRole("heading", { name: "Scribbles is checking!" });
    expect(heading).toHaveFocus();
    expect(saves()).toHaveLength(1);
    expect(saves()[0].method).toBe("post");
    // The day and the words, plus the Tell it shows for an older backend (the
    // server ignores it and stores the day's Tell itself)
    expect(JSON.parse(saves()[0].data)).toEqual({
      title: "day3",
      show: "Brr, my fingers froze.",
      tell: "Tell 3",
    });
    expect(screen.getByText("Brr, my fingers froze.")).toBeInTheDocument();
    expect(screen.getByText("Tell 3")).toBeInTheDocument();
    expect(screen.getByText(/Once Scribbles approves it, it will appear in the Show ME gallery/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "My sentences" })).toHaveAttribute("href", "/MySentences");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("ignores a sentence of only spaces and line breaks, so no day is used up", async () => {
    const user = userEvent.setup();
    const { saves } = renderWrite();

    await user.type(await box(), "   {Enter}  ");
    expect(sendButton()).toBeDisabled();
    await user.click(sendButton());

    expect(saves()).toHaveLength(0);
  });

  it("turns the button off while sending, so a double press can't save the same day twice", async () => {
    const user = userEvent.setup();
    let release!: (outcome: Outcome) => void;
    const held = new Promise<Outcome>((resolve) => (release = resolve));
    const { saves } = renderWrite({ save: () => held });

    await user.type(await box(), "First try");
    await user.dblClick(sendButton());

    const sending = screen.getByRole("button", { name: "Sending…" });
    expect(sending).toBeDisabled();
    await user.click(sending);
    expect(saves()).toHaveLength(1);

    release({ status: 201, data: { _id: "new", title: "day3", tell: "Tell 3", show: "First try" } });
    expect(await screen.findByRole("heading", { name: "Scribbles is checking!" })).toBeInTheDocument();
  });

  // Before, the box was emptied as the request left, so a failure lost the
  // student's words without a word
  it("when sending fails, says so and keeps the student's words for another try", async () => {
    const user = userEvent.setup();
    let online = false;
    const { saves } = renderWrite({
      save: () => (online ? { status: 201, data: { _id: "new", title: "day3", show: "Keep me" } } : "offline"),
    });

    await user.type(await box(), "Keep me");
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't send your sentence/i);
    expect(await box()).toHaveValue("Keep me");
    expect(screen.queryByRole("heading", { name: "Scribbles is checking!" })).not.toBeInTheDocument();

    online = true;
    await user.click(sendButton());

    expect(await screen.findByRole("heading", { name: "Scribbles is checking!" })).toBeInTheDocument();
    expect(saves()).toHaveLength(2);
  });

  // Flaky wifi: an earlier press was saved, but its answer never arrived.
  // The server refuses a second sentence for the day (409); the page loads
  // the list again and shows the one it has, instead of "check your internet"
  // over and over.
  it("when the day was already sent, loads the list again and shows the saved sentence", async () => {
    const user = userEvent.setup();
    const saved = { ...shows(3)[2], show: "Brr, my fingers froze." };
    let posted = false;
    const { requests } = renderWrite({
      list: () => ({ status: 200, data: posted ? [...shows(2), saved] : shows(2) }),
      save: () => {
        posted = true;
        return { status: 409, data: { message: "You already wrote a sentence for this day." } };
      },
    });

    await user.type(await box(), "Brr, my fingers froze.  ");
    await user.click(sendButton());

    expect(
      await screen.findByRole("heading", { name: "You already sent this one! Scribbles is checking it." })
    ).toHaveFocus();
    expect(screen.getByText("Brr, my fingers froze.")).toBeInTheDocument();
    expect(screen.getByText("Tell 3")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(requests.filter((r) => r.url === "/MyPage" && r.method === "get")).toHaveLength(2);
  });

  it("when the day was already sent but the list can't be loaded, says to look in My sentences", async () => {
    const user = userEvent.setup();
    let posted = false;
    renderWrite({
      list: () => (posted ? "offline" : { status: 200, data: shows(2) }),
      save: () => {
        posted = true;
        return 409;
      },
    });

    await user.type(await box(), "Brr");
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You already sent a sentence for this day! Open My sentences to see it."
    );
  });

  it("when too many were sent, says what the server said", async () => {
    const user = userEvent.setup();
    renderWrite({
      save: () => ({ status: 429, data: { message: "Too many saves. Wait a minute, then try again." } }),
    });

    await user.type(await box(), "Brr");
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many saves. Wait a minute, then try again.");
    expect(await box()).toHaveValue("Brr");
  });

  // The box stops at 600 characters, but an old sentence may be longer
  it("when the sentence is too long for the server, says to make it shorter", async () => {
    const user = userEvent.setup();
    const mine = shows(2);
    mine[0].show = "a".repeat(650);
    renderWrite({
      route: "/Write/s1",
      mine,
      save: () => ({ status: 400, data: { message: "The show sentence can't be longer than 600 characters" } }),
    });

    await box();
    expect(document.getElementById("show-count")).toHaveTextContent("50 too many characters");
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Your sentence is too long. Make it shorter.");
  });

  // Another tab or device already sent a different sentence for this day:
  // the student's words stay, with the way to the one already there
  it("when a different sentence was already sent for the day, keeps the words and links to it", async () => {
    const user = userEvent.setup();
    const other = { ...shows(3)[2], _id: "s3", show: "Written on the tablet." };
    let posted = false;
    renderWrite({
      list: () => ({ status: 200, data: posted ? [...shows(2), other] : shows(2) }),
      save: () => {
        posted = true;
        return 409;
      },
    });

    await user.type(await box(), "Written on the laptop.");
    await user.click(sendButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "You already wrote a sentence for this day. Open it in My sentences to change it."
    );
    expect(within(alert).getByRole("link", { name: "Open my sentence" })).toHaveAttribute("href", "/Write/s3");
    expect(await box()).toHaveValue("Written on the laptop.");
    expect(screen.queryByRole("heading", { name: /already sent this one/ })).not.toBeInTheDocument();
  });

  // The earlier press's sentence may have been checked since: say where it
  // really stands, not "checking"
  it.each([
    [{ approved: true }, "You already sent this one! It's in the gallery.", "Done · in the gallery"],
    [{ toRedo: true }, "You already sent this one! Scribbles sent it back for another try.", "Try again"],
  ])("when the day was already sent and %j since, says where it stands", async (since, heading, badge) => {
    const user = userEvent.setup();
    const saved = { ...shows(3)[2], show: "Brr.", ...since };
    let posted = false;
    renderWrite({
      list: () => ({ status: 200, data: posted ? [...shows(2), saved] : shows(2) }),
      save: () => {
        posted = true;
        return 409;
      },
    });

    await user.type(await box(), "Brr.");
    await user.click(sendButton());

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(document.querySelector(".paper-write__sent-card .paper-status")).toHaveTextContent(badge);
    expect(screen.queryByText(/Come back later/)).not.toBeInTheDocument();
  });

  it("when the sentence being edited is gone (404), says so", async () => {
    const user = userEvent.setup();
    renderWrite({ route: "/Write/s1", mine: shows(2), save: () => 404 });

    await user.type(await box(), " more");
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't find that sentence anymore. Open My sentences to see your sentences."
    );
  });

  it("gives an older sentence whose title isn't a day no number", async () => {
    const [first] = shows(1);
    renderWrite({ route: "/Write/s1", mine: [{ ...first, title: "The room was messy." }] });

    await box();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Sentence · TellTell 1$/);
  });

  it("when the server refuses it for another reason, doesn't blame the internet", async () => {
    const user = userEvent.setup();
    renderWrite({ save: () => ({ status: 400, data: { message: "Unknown day" } }) });

    await user.type(await box(), "Brr");
    await user.click(sendButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Scribbles couldn't take that sentence.");
    expect(alert).not.toHaveTextContent(/internet/);
  });

  it("when the server breaks (5xx), says to check the internet and try again", async () => {
    const user = userEvent.setup();
    renderWrite({ save: () => 500 });

    await user.type(await box(), "Brr");
    await user.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't send your sentence.*internet/i);
  });

  it("shows the sentence as the server saved it (trimmed)", async () => {
    const user = userEvent.setup();
    renderWrite({
      save: () => ({ status: 201, data: { ...shows(3)[2], show: "Brr, my fingers froze." } }),
    });

    await user.type(await box(), "  Brr, my fingers froze.  ");
    await user.click(sendButton());

    await screen.findByRole("heading", { name: "Scribbles is checking!" });
    expect(document.querySelector(".paper-write__sent-show")!.textContent).toBe("Brr, my fingers froze.");
  });

  // The day comes from the titles, not how many there are: with a gap, the
  // count would offer (and send) a day already written
  it("offers and saves the day after the latest written, past a gap", async () => {
    const user = userEvent.setup();
    const [day1, , day3] = shows(3);
    const { saves } = renderWrite({ mine: [day1, day3] });

    await user.type(await box(), "Brr");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your next TellTell 4");
    await user.click(sendButton());

    await screen.findByRole("heading", { name: "Scribbles is checking!" });
    expect(JSON.parse(saves()[0].data).title).toBe("day4");
  });

  it("doesn't skip a day for two sentences on one day", async () => {
    const [day1, day2] = shows(2);
    renderWrite({ mine: [day1, day2, { ...day2, _id: "s2b" }] });

    await box();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your next TellTell 3");
  });

  it("when the last day is written, even after gaps, says every sentence is done", async () => {
    const [day1] = shows(1);
    renderWrite({ tellCount: 35, mine: [day1, { ...day1, _id: "s35", title: "day35" }] });

    expect(await screen.findByText(/You showed every sentence!/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("when every day is done, says so instead of offering a box", async () => {
    renderWrite({ tellCount: 2, mine: shows(2) });

    expect(await screen.findByText(/You showed every sentence!/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the gallery" })).toHaveAttribute("href", "/Gallery");
  });

  it("when the student's sentences can't be loaded, says so and loads them on Try again", async () => {
    const user = userEvent.setup();
    let online = false;
    renderWrite({ list: () => (online ? { status: 200, data: shows(2) } : "offline") });

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your sentence/i);
    // A message-only state still has the page's name as a heading
    expect(screen.getByRole("heading", { level: 1, name: "Write" })).toBeInTheDocument();
    online = true;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await box()).toBeInTheDocument();
  });

  // A shared tablet: the login runs out while Ada writes, and Ben signs in
  // from the prompt, which keeps him on this page
  it("after the login runs out and someone signs in, waits for their list and doesn't keep the last student's words", async () => {
    const user = userEvent.setup();
    let release!: (outcome: Outcome) => void;
    let lists = 0;
    const { store } = renderWrite({
      list: () => {
        lists += 1;
        if (lists === 1) return { status: 200, data: shows(2) };
        return new Promise<Outcome>((resolve) => (release = resolve)); // Ben's, held back
      },
    });
    await user.type(await box(), "Ada's unsent words");

    act(() => {
      store.dispatch({ type: "LOGOUT" });
    });
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    act(() => {
      store.dispatch({ type: "FIND_USER", payload: { id: "g-ben", firstName: "Ben", lastName: "Bit" } });
    });

    // Ben's list isn't here yet: no box that would save as "day 1"
    await waitFor(() => expect(lists).toBe(2));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    release({ status: 200, data: shows(4) });

    expect(await box()).toHaveValue("");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tell 5");
  });

  describe("editing (/Write/<id>)", () => {
    it("opens that day's Tell sentence with the sentence in the box", async () => {
      renderWrite({ route: "/Write/s1", mine: shows(3) });

      expect(await box()).toHaveValue("Show 1");
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sentence 1 · TellTell 1");
    });

    // Not the Tell at its place in the list: with gaps they differ
    it("shows the sentence's own day and its stored Tell", async () => {
      const [first] = shows(1);
      renderWrite({ route: "/Write/s1", mine: [{ ...first, title: "day5", tell: "Stored Tell" }] });

      await box();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sentence 5 · TellStored Tell");
    });

    it("saving sends the change, then says Scribbles is checking", async () => {
      const user = userEvent.setup();
      const mine = shows(2);
      mine[1].toRedo = true;
      const { saves } = renderWrite({ route: "/Write/s2", mine });

      const input = await box();
      expect(bubble()).toHaveTextContent(/even better/);
      await user.clear(input);
      await user.type(input, "Better 2");
      await user.click(sendButton());

      await screen.findByRole("heading", { name: "Scribbles is checking!" });
      expect(saves()).toHaveLength(1);
      expect(saves()[0].method).toBe("patch");
      // The server puts it back to waiting to be checked
      expect(JSON.parse(saves()[0].data)).toEqual({ title: "day2", show: "Better 2" });
      expect(screen.getByText("Better 2")).toBeInTheDocument();
    });

    it("warns that changing a sentence in the gallery sends it back to Scribbles", async () => {
      const mine = shows(2);
      mine[0].approved = true;
      renderWrite({ route: "/Write/s1", mine });

      await box();
      expect(screen.getByText(/Scribbles checks it again first/)).toBeInTheDocument();
    });

    it("doesn't warn for a sentence that isn't in the gallery", async () => {
      renderWrite({ route: "/Write/s1", mine: shows(2) });

      await box();
      expect(screen.queryByText(/Scribbles checks it again first/)).not.toBeInTheDocument();
    });

    it("an address for a sentence that isn't the student's says so", async () => {
      renderWrite({ route: "/Write/nope", mine: shows(2) });

      expect(await screen.findByText(/couldn't find that sentence/i)).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole("link", { name: "My sentences" })).toHaveAttribute("href", "/MySentences")
      );
    });
  });
});
