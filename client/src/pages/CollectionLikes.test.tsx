import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Collection from "./Collection";
import { renderWithApp } from "../test/testUtils";
import { API } from "../api";
import { setupInterceptors } from "../api/interceptors";
import type { Outcome } from "../test/testUtils";
import type { SentenceLikes, SentenceWithAuthor, User } from "../api/types";

// Likes on the Collections page: only signed-in users see or give them.

const tellsentences = [{ key: 1, id: "day1", technique: "senses" as const, title: "Day 1", tell: "It is cold outside.", image: "/cold.jpg" }];

const sentence = (n: number): SentenceWithAuthor => ({
  _id: `id-${n}`,
  title: "day1",
  tell: "It is cold outside.",
  show: `Sentence ${n}`,
  approved: true,
  toRedo: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  author: { firstName: "Ada", lastName: "Lovelace" },
});
const sentences = [sentence(1), sentence(2), sentence(3)];

// Sentence 1: liked by nobody yet. Sentence 2: liked by the user and one
// other. Sentence 3: the user's own.
const serverLikes = (): SentenceLikes[] => [
  { _id: "id-1", likes: 1, likedByMe: false, mine: false },
  { _id: "id-2", likes: 3, likedByMe: true, mine: false },
  { _id: "id-3", likes: 2, likedByMe: false, mine: true },
];

const alan: User = {
  id: "google-alan",
  firstName: "Alan",
  lastName: "Turing",
  email: "alan@example.com",
  isAdmin: false,
};

interface Request {
  method?: string;
  url?: string;
}

// `like`: how the server answers a like or unlike (by default, as the real
// one would)
const renderCollection = ({
  user,
  likes = () => ({ status: 200, data: serverLikes() }),
  like,
}: {
  user?: User;
  likes?: () => Outcome | Promise<Outcome>;
  like?: (request: Request) => Outcome | Promise<Outcome>;
} = {}) => {
  const requests: Request[] = [];
  const view = renderWithApp(<Collection />, {
    state: { tellsentences, user: user ?? {} },
    route: "/Collections",
    respond: (config) => {
      requests.push({ method: config.method, url: config.url });
      if (config.url === "/Collections") return { status: 200, data: sentences };
      if (config.url === "/Collections/likes") return likes();
      const match = config.url?.match(/^\/Collections\/(.+)\/like$/);
      if (match) {
        if (like) return like(config);
        const before = serverLikes().find((entry) => entry._id === match[1])!;
        const liking = config.method === "put";
        return {
          status: 200,
          data: { ...before, likedByMe: liking, likes: liking ? 2 : 1 },
        };
      }
      return 200;
    },
  });
  return { ...view, requests };
};

// The card showing `show`
const card = async (show: string) =>
  (await screen.findByText(show)).closest("article") as HTMLElement;

const likeRequests = (requests: Request[]) =>
  requests.filter((r) => r.url?.endsWith("/like"));

afterEach(() => {
  delete window.earlyRequests;
});

describe("Collections likes, signed out", () => {
  it("shows no likes and doesn't ask the server for any", async () => {
    const { requests } = renderCollection();

    await screen.findByText("Sentence 1");
    expect(screen.queryByRole("button", { name: "Like" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\blikes?\b/)).not.toBeInTheDocument();
    expect(requests.map((r) => r.url)).not.toContain("/Collections/likes");
  });
});

describe("Collections likes, signed in", () => {
  it("shows each sentence's likes, and which the user liked", async () => {
    renderCollection({ user: alan });

    const first = await card("Sentence 1");
    expect(await within(first).findByText("1 like")).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "false");

    const second = await card("Sentence 2");
    expect(within(second).getByText("3 likes")).toBeInTheDocument();
    expect(within(second).getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the count on the user's own sentence, with nothing to press", async () => {
    renderCollection({ user: alan });

    const own = await card("Sentence 3");
    expect(await within(own).findByText("2 likes")).toBeInTheDocument();
    expect(within(own).queryByRole("button", { name: "Like" })).not.toBeInTheDocument();
  });

  it("has Scribbles tell a student when one of theirs is on show", async () => {
    renderCollection({ user: alan });

    expect(await screen.findByText(`I taped yours up, ${alan.firstName}!`)).toBeInTheDocument();
  });

  it("has Scribbles say what the page is when none of the student's are on show", async () => {
    renderCollection({
      user: alan,
      likes: () => ({ status: 200, data: serverLikes().map((entry) => ({ ...entry, mine: false })) }),
    });

    await card("Sentence 1");
    expect(await screen.findByText("Look what everyone made!")).toBeInTheDocument();
    expect(screen.queryByText(/I taped yours up/)).not.toBeInTheDocument();
  });

  it("likes a sentence, then takes the like back", async () => {
    const user = userEvent.setup();
    const { requests } = renderCollection({ user: alan });
    const first = await card("Sentence 1");

    await user.click(await within(first).findByRole("button", { name: "Like" }));

    expect(await within(first).findByText("2 likes")).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(first).getByRole("button", { name: "Like" }));

    expect(await within(first).findByText("1 like")).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "false");
    expect(likeRequests(requests)).toEqual([
      { method: "put", url: "/Collections/id-1/like" },
      { method: "delete", url: "/Collections/id-1/like" },
    ]);
  });

  // The pop is for a press, not for hearts the page shows already liked
  it("pops the heart the student just pressed, and no other", async () => {
    const user = userEvent.setup();
    renderCollection({ user: alan });
    const first = await card("Sentence 1");
    const second = await card("Sentence 2");
    const heart = (within_: HTMLElement) => within(within_).getByRole("button", { name: "Like" });
    await within(first).findByText("1 like");

    expect(heart(second)).not.toHaveClass("paper-like__heart--pop");

    await user.click(heart(first));
    expect(heart(first)).toHaveClass("paper-like__heart--pop");
    expect(heart(second)).not.toHaveClass("paper-like__heart--pop");

    // Taking the like back doesn't pop
    await within(first).findByText("2 likes");
    await user.click(heart(first));
    expect(heart(first)).not.toHaveClass("paper-like__heart--pop");
  });

  it("changes the heart at once, then shows the server's count", async () => {
    const user = userEvent.setup();
    let answer!: (outcome: Outcome) => void;
    renderCollection({
      user: alan,
      // Meanwhile two other students liked it too
      like: () => new Promise((resolve) => (answer = resolve)),
    });
    const first = await card("Sentence 1");

    await user.click(await within(first).findByRole("button", { name: "Like" }));

    expect(within(first).getByText("2 likes")).toBeInTheDocument();
    await act(async () =>
      answer({ status: 200, data: { _id: "id-1", likes: 4, likedByMe: true, mine: false } })
    );
    expect(await within(first).findByText("4 likes")).toBeInTheDocument();
  });

  it("puts the like back as it was when the server refuses it", async () => {
    const user = userEvent.setup();
    renderCollection({ user: alan, like: () => 500 });
    const first = await card("Sentence 1");

    await user.click(await within(first).findByRole("button", { name: "Like" }));

    await waitFor(() =>
      expect(within(first).getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "false")
    );
    expect(within(first).getByText("1 like")).toBeInTheDocument();
  });

  it("sends one request for a double click", async () => {
    const user = userEvent.setup();
    let answer!: (outcome: Outcome) => void;
    const { requests } = renderCollection({
      user: alan,
      like: () => new Promise((resolve) => (answer = resolve)),
    });
    const first = await card("Sentence 1");
    const heart = await within(first).findByRole("button", { name: "Like" });

    await user.dblClick(heart);
    await act(async () =>
      answer({ status: 200, data: { _id: "id-1", likes: 2, likedByMe: true, mine: false } })
    );

    expect(likeRequests(requests)).toHaveLength(1);
    expect(await within(first).findByText("2 likes")).toBeInTheDocument();
  });

  it("still shows the sentences when the likes can't be loaded, and Try again asks again", async () => {
    const user = userEvent.setup();
    let likesCalls = 0;
    let collectionCalls = 0;
    renderWithApp(<Collection />, {
      state: { tellsentences, user: alan },
      route: "/Collections",
      respond: (config) => {
        if (config.url === "/Collections") {
          collectionCalls += 1;
          return collectionCalls === 1 ? 500 : { status: 200, data: sentences };
        }
        if (config.url === "/Collections/likes") {
          likesCalls += 1;
          return likesCalls === 1 ? "offline" : { status: 200, data: serverLikes() };
        }
        return 200;
      },
    });

    // The first likes request has been answered (offline): no hearts, and
    // no error about likes either
    await waitFor(() => expect(likesCalls).toBe(1));
    await user.click(await screen.findByRole("button", { name: /try again/i }));

    const first = await card("Sentence 1");
    expect(await within(first).findByText("1 like")).toBeInTheDocument();
    expect(likesCalls).toBe(2);
  });

  it("shows sentences but no likes when only the likes fail to load", async () => {
    let answered = false;
    renderCollection({
      user: alan,
      likes: () => {
        answered = true;
        return "offline";
      },
    });

    await screen.findByText("Sentence 1");
    await waitFor(() => expect(answered).toBe(true));
    // Let the failed answer be handled before checking
    await act(async () => {});
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Like" })).not.toBeInTheDocument();
  });

  it("hides the likes as soon as the user logs out", async () => {
    const { store } = renderCollection({ user: alan });
    const first = await card("Sentence 1");
    await within(first).findByText("1 like");

    act(() => {
      store.dispatch({ type: "LOGOUT" });
    });

    expect(screen.queryByText(/\blikes?\b/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Like" })).not.toBeInTheDocument();
    expect(screen.getByText("Sentence 1")).toBeInTheDocument();
  });

  it("logs out and shows no likes when the login has expired (the server answers 401)", async () => {
    let answered = false;
    // Alan's remembered by the browser, but his login has run out. The app's
    // 401 rule is installed (as index.tsx does) before he's signed in, so
    // the likes request goes through it.
    const { store } = renderCollection({
      likes: () => {
        answered = true;
        return 401;
      },
    });
    const interceptorId = setupInterceptors(store);
    onTestFinished(() => API.interceptors.response.eject(interceptorId));
    await screen.findByText("Sentence 1");
    act(() => {
      store.dispatch({ type: "FIND_USER", payload: alan });
    });

    await waitFor(() => expect(answered).toBe(true));
    await waitFor(() => expect(store.getState().user).toEqual({}));
    expect(screen.queryByText(/\blikes?\b/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Like" })).not.toBeInTheDocument();
  });

  it("logs out when a like is refused because the login expired", async () => {
    const user = userEvent.setup();
    const { store } = renderCollection({ user: alan, like: () => 401 });
    const interceptorId = setupInterceptors(store);
    onTestFinished(() => API.interceptors.response.eject(interceptorId));
    const first = await card("Sentence 1");

    await user.click(await within(first).findByRole("button", { name: "Like" }));

    await waitFor(() => expect(store.getState().user).toEqual({}));
    expect(screen.queryByRole("button", { name: "Like" })).not.toBeInTheDocument();
    expect(screen.getByText("Sentence 1")).toBeInTheDocument();
  });
});
