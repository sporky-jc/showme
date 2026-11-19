import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import Write from "./Write";
import { OpenLoginContext } from "../components/loginPopup";
import type { InternalAxiosRequestConfig } from "axios";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";
import type { Sentence, TellSentence } from "../api/types";

// The Write page: today's Tell sentence, a box to show it in, Scribbles'
// questions for each sense, and what happens once it's sent. With a
// sentence's id in the address, that sentence is edited.

const ada = { id: "g-ada", firstName: "Ada", lastName: "Lovelace" };

const tells = (n: number): TellSentence[] =>
  Array.from({ length: n }, (_, i) => ({
    key: i + 1,
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
  mine = shows(2),
  list,
  save,
}: {
  route?: string;
  tellCount?: number;
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
      state: { user: ada, tellsentences: tells(tellCount), usersentences: [] },
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
        if (config.url === "/Login") return { status: 200, data: ada };
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

  it("shows today's Tell sentence: the one after the student's last", async () => {
    renderWrite({ mine: shows(2) });

    await box();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Today's TellTell 3");
    expect(screen.getByRole("link", { name: /Back to today/ })).toHaveAttribute("href", "/");
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
  });

  it("pressing a sense makes Scribbles ask about it; pressing it again asks something else", async () => {
    const user = userEvent.setup();
    renderWrite();
    await box();
    expect(bubble()).toHaveTextContent("Tap a sense and I'll help you think!");

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

  it("sending saves the sentence for the right day, then says Scribbles is checking", async () => {
    const user = userEvent.setup();
    const { saves } = renderWrite({ mine: shows(2) });

    await user.type(await box(), "Brr, my fingers froze.");
    await user.click(sendButton());

    const heading = await screen.findByRole("heading", { name: "Scribbles is checking!" });
    expect(heading).toHaveFocus();
    expect(saves()).toHaveLength(1);
    expect(saves()[0].method).toBe("post");
    expect(JSON.parse(saves()[0].data)).toEqual({
      title: "day3",
      tell: "Tell 3",
      show: "Brr, my fingers froze.",
    });
    expect(screen.getByText("Brr, my fingers froze.")).toBeInTheDocument();
    expect(screen.getByText("Tell 3")).toBeInTheDocument();
    expect(screen.getByText(/Once your teacher approves it, it will appear in the gallery/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to today" })).toHaveAttribute("href", "/");
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

  it("when every day is done, says so instead of offering a box", async () => {
    renderWrite({ tellCount: 2, mine: shows(2) });

    expect(await screen.findByText(/You showed every sentence!/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the class gallery" })).toHaveAttribute("href", "/Gallery");
  });

  it("when the student's sentences can't be loaded, says so and loads them on Try again", async () => {
    const user = userEvent.setup();
    let online = false;
    renderWrite({ list: () => (online ? { status: 200, data: shows(2) } : "offline") });

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your sentence/i);
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
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Day 1 · TellTell 1");
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

    it("warns that changing a sentence in the gallery sends it back to the teacher", async () => {
      const mine = shows(2);
      mine[0].approved = true;
      renderWrite({ route: "/Write/s1", mine });

      await box();
      expect(screen.getByText(/your teacher checks it again first/)).toBeInTheDocument();
    });

    it("doesn't warn for a sentence that isn't in the gallery", async () => {
      renderWrite({ route: "/Write/s1", mine: shows(2) });

      await box();
      expect(screen.queryByText(/your teacher checks it again first/)).not.toBeInTheDocument();
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
