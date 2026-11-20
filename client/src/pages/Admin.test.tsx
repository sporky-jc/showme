import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router";
import Admin from "./Admin";
import { checkSession } from "../actions/user";
import type { InternalAxiosRequestConfig } from "axios";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";
import type { QueueSentence, ReviewTip } from "../api/types";
import type { UserState } from "../reducers/user";

// The Teacher page: the sentences waiting for a teacher, longest wait
// first, each on a card with the way to approve it or send it back.

// What every waiting sentence shares
const pending = { approved: false, toRedo: false, createdAt: "2026-10-01T00:00:00.000Z" };

const waiting: QueueSentence[] = [
  { _id: "a", title: "day1", tell: "It is cold outside.", show: "Frost bit my fingers.", author: { firstName: "Mia", lastName: "Torres" }, ...pending },
  { _id: "b", title: "day2", tell: "It is hot outside.", show: "The road shimmered.", author: { firstName: "Leo", lastName: "Chen" }, ...pending },
];

// The tips a teacher can send back (GET /Admin/tips)
const TIPS: ReviewTip[] = [
  { id: "see", text: "Add something you would see. What colors or shapes are there?" },
  { id: "hear", text: "Add a sound you would hear." },
  { id: "feel", text: "Add how something feels. Is it warm, cold, rough or soft?" },
  { id: "smell", text: "Add a smell. What's in the air?" },
  { id: "spelling", text: "Check your spelling. Read each word slowly, letter by letter." },
];

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

// `user` is who the browser remembers; `sessionChecked` says whether the server
// has already confirmed who is logged in; `login` is the server's answer to
// GET /Login (a promise holds it back until the test releases it).
const renderAdmin = ({
  user = { firstName: "Grace", isAdmin: true },
  sessionChecked = true,
  login = { status: 200, data: user },
  afterUpdate = [waiting[1]],
  queue = waiting,
  list,
  update,
  tips = TIPS,
}: {
  user?: UserState;
  sessionChecked?: boolean;
  login?: Outcome | Promise<Outcome>;
  afterUpdate?: QueueSentence[];
  queue?: QueueSentence[];
  list?: () => Outcome | Promise<Outcome>;
  update?: () => Outcome | Promise<Outcome>;
  tips?: ReviewTip[];
} = {}) => {
  const requests: InternalAxiosRequestConfig[] = [];
  const view = renderWithApp(
    <Routes>
      <Route path="*" element={<><Admin /><Where /></>} />
    </Routes>,
    {
      state: { user, session: { checked: sessionChecked }, approvalsentences: [] },
      route: "/admin",
      respond: (config) => {
        requests.push(config);
        if (config.url === "/Login") return login;
        if (config.url === "/Admin/tips") return { status: 200, data: tips };
        if (config.method === "get" && config.url === "/Admin") {
          return list ? list() : { status: 200, data: queue };
        }
        if (config.method === "patch" && config.url === "/Admin") {
          return update ? update() : { status: 201, data: afterUpdate };
        }
        return 200;
      },
    }
  );
  return { ...view, requests };
};

const student = { firstName: "Test", isAdmin: false };
const admin = { firstName: "Test", isAdmin: true };

// The cards, in the order shown
const cards = () => screen.queryAllByRole("listitem");
const names = () => screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent);
const approve = (name: string) => screen.getByRole("button", { name: `Approve: ${name}'s sentence` });
const tryAgain = (name: string) => screen.getByRole("button", { name: `Try again: ${name}'s sentence` });

describe("Admin", () => {
  it("sends a non-admin back to the home page", async () => {
    renderAdmin({ user: { firstName: "Ada", isAdmin: false } });

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
    expect(screen.queryByText("Needs your eyes")).not.toBeInTheDocument();
  });

  // What QA Wolf runs recorded: the browser still remembered the student who
  // used it a moment earlier when an admin logged in and opened /admin. The page
  // judged by that memory and sent the admin home before the server's "this is
  // the admin" arrived (641 ms later).
  it("waits for the server before judging, so a remembered student can't send an admin away", async () => {
    let release!: (outcome: Outcome) => void;
    const login = new Promise<Outcome>((resolve) => (release = resolve));
    const { store } = renderAdmin({ user: student, sessionChecked: false, login });

    // The app asks the server who is logged in (App.tsx does this on startup)
    const checking = store.dispatch(checkSession());
    expect(screen.getByTestId("where")).toHaveTextContent("/admin");
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    release({ status: 200, data: admin });
    await checking;

    expect(await screen.findByText("Needs your eyes")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/admin");
  });

  it("sends a student home once the server confirms they aren't an admin", async () => {
    const { store } = renderAdmin({ user: student, sessionChecked: false });

    await store.dispatch(checkSession());

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
  });

  it("lists each waiting sentence with its student, show and tell sentence, and how many are waiting", async () => {
    renderAdmin();

    expect(await screen.findByRole("heading", { level: 1, name: "Needs your eyes" })).toBeInTheDocument();
    expect(screen.getByText("Mia Torres")).toBeInTheDocument();
    expect(screen.getByText("Frost bit my fingers.")).toBeInTheDocument();
    expect(screen.getByText("It is cold outside.")).toBeInTheDocument();
    expect(screen.getByText("Leo Chen")).toBeInTheDocument();
    expect(cards()).toHaveLength(2);
    expect(screen.getByText("2 waiting")).toBeInTheDocument();
  });

  // The server sends the newest first; nobody should be left at the bottom
  it("puts the longest wait first, and says how long each has waited", async () => {
    const day = 86_400_000;
    const sent = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
    renderAdmin({
      queue: [
        { ...waiting[0], _id: "new", author: { firstName: "Newest" }, createdAt: sent(0) },
        { ...waiting[0], _id: "mid", author: { firstName: "Middle" }, createdAt: sent(1) },
        { ...waiting[0], _id: "old", author: { firstName: "Oldest" }, createdAt: sent(5) },
      ],
    });

    await screen.findByText("Oldest");
    expect(names()).toEqual(["Oldest", "Middle", "Newest"]);
    expect(cards()[0]).toHaveTextContent("Sent 5 days ago");
    expect(cards()[1]).toHaveTextContent("Sent yesterday");
    expect(cards()[2]).toHaveTextContent("Sent today");
  });

  // By the calendar, not by 24-hour blocks: the usual morning review of
  // what was written the afternoon before
  it("calls a sentence sent late yesterday 'yesterday', even if that was only minutes ago", async () => {
    const lastNight = new Date();
    lastNight.setHours(0, 0, 0, 0);
    lastNight.setMinutes(-1); // 23:59 yesterday
    renderAdmin({ queue: [{ ...waiting[0], createdAt: lastNight.toISOString() }] });

    await screen.findByText("Mia Torres");
    expect(cards()[0]).toHaveTextContent("Sent yesterday");
  });

  it("the last decision leaves the keyboard on the heading and says all caught up", async () => {
    renderAdmin({ queue: [waiting[0]], afterUpdate: [] });
    await screen.findByText("Mia Torres");

    fireEvent.click(approve("Mia Torres"));

    expect(await screen.findByText("All caught up!")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Approved Mia Torres's sentence. All caught up!");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
  });

  it("approving a card sends that card's sentence, then shows the updated queue and says so", async () => {
    const { requests } = renderAdmin({ afterUpdate: [waiting[1]] });
    await screen.findByText("Mia Torres");

    fireEvent.click(approve("Mia Torres"));

    const patch = await waitFor(() => {
      const found = requests.find((r) => r.method === "patch");
      expect(found).toBeDefined();
      return found!; // defined: checked just above
    });
    expect(JSON.parse(patch.data)).toEqual({ status: "approve", sentence: waiting[0], tip: null });
    await waitFor(() => expect(screen.queryByText("Mia Torres")).not.toBeInTheDocument());
    expect(cards()).toHaveLength(1);
    expect(screen.getByText("1 waiting")).toBeInTheDocument();
    // For screen readers; the keyboard goes to the card that took its place
    expect(screen.getByRole("status")).toHaveTextContent("Approved Mia Torres's sentence. 1 waiting.");
    await waitFor(() => expect(approve("Leo Chen")).toHaveFocus());
  });

  it("Try again, then Send back, sends 'redo' with that card's sentence and no tip", async () => {
    const { requests } = renderAdmin({ afterUpdate: [waiting[0]] });
    await screen.findByText("Leo Chen");

    fireEvent.click(tryAgain("Leo Chen"));
    expect(requests.filter((r) => r.method === "patch")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Send back: Leo Chen's sentence" }));

    const patch = await waitFor(() => {
      const found = requests.find((r) => r.method === "patch");
      expect(found).toBeDefined();
      return found!; // defined: checked just above
    });
    expect(JSON.parse(patch.data)).toEqual({ status: "redo", sentence: waiting[1], tip: null });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Sent Leo Chen's sentence back to try again. 1 waiting.")
    );
  });

  it("turns every button off while a decision is being saved, so a second press can't send another", async () => {
    let release!: (outcome: Outcome) => void;
    const held = new Promise<Outcome>((resolve) => (release = resolve));
    const { requests } = renderAdmin({ update: () => held });
    await screen.findByText("Mia Torres");

    fireEvent.click(approve("Mia Torres"));

    expect(await screen.findByRole("button", { name: "Saving: Mia Torres's sentence" })).toHaveTextContent("Saving…");
    screen.getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
    fireEvent.click(tryAgain("Leo Chen"));
    expect(requests.filter((r) => r.method === "patch")).toHaveLength(1);

    release({ status: 201, data: [waiting[1]] });
    await waitFor(() => expect(approve("Leo Chen")).toBeEnabled());
  });

  // Before, a decision the server didn't take failed without a word
  it("when a decision can't be saved, says so and keeps the card and the keyboard on it for another try", async () => {
    let online = false;
    renderAdmin({ update: () => (online ? { status: 201, data: [waiting[1]] } : "offline") });
    await screen.findByText("Mia Torres");

    fireEvent.click(approve("Mia Torres"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't save/i);
    expect(screen.getByText("Mia Torres")).toBeInTheDocument();
    await waitFor(() => expect(approve("Mia Torres")).toHaveFocus());

    online = true;
    fireEvent.click(approve("Mia Torres"));

    await waitFor(() => expect(screen.queryByText("Mia Torres")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // The student edited it after the page loaded, or someone already reviewed
  // it: the server refuses (409), and the page says so and shows the latest,
  // so the new words get read before anyone approves them
  it("when the sentence changed or was already reviewed, says so and shows the latest words", async () => {
    let lists = 0;
    const edited = { ...waiting[0], show: "Words the reviewer hasn't read yet." };
    renderAdmin({
      list: () => {
        lists += 1;
        return { status: 200, data: lists === 1 ? waiting : [edited, waiting[1]] };
      },
      update: () => 409,
    });
    await screen.findByText("Mia Torres");

    fireEvent.click(approve("Mia Torres"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This sentence changed or someone already reviewed it. Here's the latest."
    );
    expect(await screen.findByText("Words the reviewer hasn't read yet.")).toBeInTheDocument();
    expect(lists).toBe(2);
  });

  it("says so even when the sentence that didn't count was the last one", async () => {
    let lists = 0;
    renderAdmin({
      list: () => {
        lists += 1;
        return { status: 200, data: lists === 1 ? [waiting[0]] : [] };
      },
      update: () => 409,
    });
    await screen.findByText("Mia Torres");

    fireEvent.click(approve("Mia Torres"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This sentence changed or someone already reviewed it. Here's the latest."
    );
    expect(screen.getByText("All caught up!")).toBeInTheDocument();
  });

  // The sentence is gone on the server (say, someone else handled it): its
  // card mustn't stay behind to fail again and again
  it("when the server no longer has the sentence, asks for the queue again so its card goes", async () => {
    let lists = 0;
    renderAdmin({
      list: () => {
        lists += 1;
        return { status: 200, data: lists === 1 ? waiting : [waiting[1]] };
      },
      update: () => 404,
    });
    await screen.findByText("Mia Torres");

    fireEvent.click(approve("Mia Torres"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't save/i);
    await waitFor(() => expect(screen.queryByText("Mia Torres")).not.toBeInTheDocument());
    expect(screen.getByText("Leo Chen")).toBeInTheDocument();
    expect(lists).toBe(2);
  });

  it("with nothing waiting, says all caught up and points to the gallery", async () => {
    renderAdmin({ queue: [] });

    expect(await screen.findByText("All caught up!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the gallery" })).toHaveAttribute("href", "/Gallery");
    expect(cards()).toHaveLength(0);
    expect(screen.queryByText(/waiting$/)).not.toBeInTheDocument();
  });

  // Before, a queue that couldn't be loaded looked the same as an empty one
  it("when the queue can't be loaded, says so and loads it on Try again", async () => {
    let online = false;
    renderAdmin({ list: () => (online ? { status: 200, data: waiting } : "offline") });

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load the sentences/i);
    expect(screen.queryByText("All caught up!")).not.toBeInTheDocument();

    online = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Mia Torres")).toBeInTheDocument();
  });

  // A second, later answer can land right after an approval and bring back a
  // queue from before it (a QA Wolf run recorded two requests sent together)
  it("asks for the queue once when the login check confirms an admin", async () => {
    const { store, requests } = renderAdmin({ user: student, sessionChecked: false, login: { status: 200, data: admin } });

    await store.dispatch(checkSession());
    await screen.findByText("Mia Torres"); // the queue has arrived

    expect(requests.filter((r) => r.method === "get" && r.url === "/Admin")).toHaveLength(1);
  });

  // What a QA Wolf run recorded: the queue grew (other students' sentences
  // arrived) just as the admin clicked approve on a row, and the sentence that
  // had moved into that row's place was approved instead. (It was a table then.)
  it("approves the sentence on the card that was pressed, even if the queue changed just before", async () => {
    const { store, requests } = renderAdmin();
    await screen.findByText("Leo Chen");
    const leosApprove = approve("Leo Chen"); // the teacher aims at Leo's card

    const newer = { _id: "c", title: "day1", tell: "It is cold outside.", show: "Ice cracked underfoot.", author: { firstName: "Ana", lastName: "Ruiz" }, ...pending };
    store.dispatch({ type: "FETCH_APPROVAL", payload: [newer, ...waiting] }); // Ana's arrives
    await waitFor(() => expect(cards()).toHaveLength(3)); // the queue has redrawn
    fireEvent.click(leosApprove);

    const patch = await waitFor(() => {
      const found = requests.find((r) => r.method === "patch");
      expect(found).toBeDefined();
      return found!; // defined: checked just above
    });
    expect(JSON.parse(patch.data).sentence.show).toBe("The road shimmered.");
  });

  // The database doesn't require a last name (older accounts, and Google
  // accounts without one)
  it("shows just the first name of a student who has no last name", async () => {
    const { store } = renderAdmin();
    await screen.findByText("Mia Torres"); // the queue has arrived

    store.dispatch({
      type: "FETCH_APPROVAL",
      payload: [{ ...waiting[0], author: { firstName: "Bo" } }],
    });

    expect(await screen.findByText("Bo")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });
});

describe("Scribbles' notes", () => {
  const sentence = (id: string, firstName: string, show: string, suggestion?: QueueSentence["suggestion"]): QueueSentence => ({
    _id: id,
    title: "day1",
    tell: "The cafeteria was loud.",
    show,
    author: { firstName, lastName: "K" },
    ...pending,
    suggestion,
  });
  const ready = sentence("r", "Leo", "Trays clattered and chairs scraped.", {
    verdict: "approve",
    tip: { id: "great", text: "Great picture! Keep painting with words." },
    reasons: ["ai"],
  });
  const again = sentence("g", "Maya", "The cafateria was lound with trays banging.", {
    verdict: "redo",
    tip: { id: "spelling", text: "Check your spelling. Read each word slowly, letter by letter." },
    reasons: ["ai", "spelling"],
    misspelled: ["cafateria", "lound"],
  });
  const worrying = { ...sentence("w", "Ava", "Nobody at home talks to me anymore.", {
    verdict: "unsure",
    tip: null,
    reasons: ["worrying"],
  }), createdAt: "2026-10-05T00:00:00.000Z" };
  const plain = sentence("p", "Sam", "She danced like a noodle.");

  it("puts a sentence that may mean a student needs help first, with a note to check in", async () => {
    renderAdmin({ queue: [ready, again, worrying, plain] });
    await screen.findByText("Ava K");

    expect(names()).toEqual(["Ava K", "Leo K", "Maya K", "Sam K"]);
    const notes = screen.getAllByRole("note");
    expect(notes[0]).toHaveTextContent("Ava may need help.");
    expect(notes[0]).toHaveTextContent("No AI saw it.");
    expect(notes[1]).toHaveTextContent("Ready for the gallery.");
    expect(notes[1]).toHaveTextContent("Leo will see: \u201cGreat picture! Keep painting with words.\u201d");
    expect(notes[2]).toHaveTextContent("Words to fix: cafateria, lound.");
    // No suggestion, no note
    expect(notes).toHaveLength(3);
    expect(screen.getByRole("list", { name: "Scribbles' notes" })).toHaveTextContent(/1 to check in on.*1 ready.*1 try again/);
  });

  it("marks the misspelled words in the sentence", async () => {
    renderAdmin({ queue: [again] });
    await screen.findByText("Maya K");

    const marked = document.querySelectorAll("mark.paper-review__misspelled");
    expect([...marked].map((mark) => mark.firstChild?.textContent)).toEqual(["cafateria", "lound"]);
    expect(screen.getByText(/The/, { selector: "p.paper-review__show" })).toHaveTextContent(
      "The cafateria (misspelled) was lound (misspelled) with trays banging."
    );
  });

  it("Try again starts on Scribbles' tip, and Send back sends its id", async () => {
    const { requests } = renderAdmin({ queue: [again], afterUpdate: [] });
    await screen.findByText("Maya K");

    fireEvent.click(tryAgain("Maya K"));

    const group = screen.getByRole("radiogroup", { name: "Which tip should Maya see?" });
    const pick = screen.getByRole("radio", { name: /Check your spelling/ });
    expect(pick).toBeChecked();
    expect(group).toHaveTextContent("Scribbles' pick");
    await waitFor(() => expect(pick).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Send back: Maya K's sentence" }));

    await waitFor(() => expect(requests.some((r) => r.method === "patch")).toBe(true));
    const sent = JSON.parse(requests.find((r) => r.method === "patch")!.data);
    expect(sent).toMatchObject({ status: "redo", tip: "spelling", sentence: { _id: "g" } });
    // Scribbles' suggestion stays on the page
    expect(sent.sentence.suggestion).toBeUndefined();
  });

  it("can send another tip, or none, and shows every tip on request", async () => {
    const { requests } = renderAdmin({ queue: [plain], afterUpdate: [] });
    await screen.findByText("Sam K");

    fireEvent.click(tryAgain("Sam K"));
    // No suggestion: no tip to start with, and the first few tips offered
    expect(screen.getByRole("radio", { name: /No tip/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /Check your spelling/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See all tips" }));
    fireEvent.click(screen.getByRole("radio", { name: /Add a sound/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send back: Sam K's sentence" }));

    await waitFor(() => expect(requests.some((r) => r.method === "patch")).toBe(true));
    expect(JSON.parse(requests.find((r) => r.method === "patch")!.data)).toMatchObject({ status: "redo", tip: "hear" });
  });

  it("Cancel closes the tips without sending, and puts the keyboard back on the card", async () => {
    const { requests } = renderAdmin({ queue: [plain] });
    await screen.findByText("Sam K");

    fireEvent.click(tryAgain("Sam K"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    await waitFor(() => expect(approve("Sam K")).toHaveFocus());
    expect(requests.filter((r) => r.method === "patch")).toHaveLength(0);
  });
});
