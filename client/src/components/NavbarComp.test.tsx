import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import NavbarComp from "./NavbarComp";
import { renderWithApp } from "../test/testUtils";

// Going to /login directly (an old bookmark, or typing the address) must open
// the sign-in pop-up over the home page, like the navbar's Login link does,
// instead of showing an empty page. Pages can open the same pop-up: About's
// "Join Us!" and MyPage's "Sign in", for visitors who aren't signed in.

// The app loads each page's code on demand. In a busy test run that can take
// over a second, longer than the tests wait for the page, so load it up front.
beforeAll(() =>
  Promise.all([
    import("../pages/About"),
    import("../pages/Login"),
    import("../pages/MyPage"),
    import("../pages/Collection"),
    import("../pages/Write"),
  ])
);

beforeEach(() => {
  // A pretend Google sign-in script, for the pop-up's button
  vi.stubGlobal("google", {
    accounts: { id: { initialize: vi.fn(), renderButton: vi.fn(), prompt: vi.fn() } },
  });
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Shows the current address
const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

describe("NavbarComp", () => {
  it("opens the sign-in pop-up over the home page when visiting /login", async () => {
    renderWithApp(
      <>
        <NavbarComp />
        <Where />
      </>,
      { route: "/login", respond: () => 401 }
    );

    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
  });

  it("opens the sign-in pop-up from About's Join Us! when not signed in, staying on About", async () => {
    renderWithApp(
      <>
        <NavbarComp />
        <Where />
      </>,
      { route: "/about", respond: () => 401 }
    );

    await userEvent.click(await screen.findByRole("link", { name: "Join Us!" }));

    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/about$/);
  });

  it("opens the sign-in pop-up from My sentences' Sign in button when not signed in", async () => {
    renderWithApp(<NavbarComp />, { route: "/MySentences", respond: () => 401 });

    await userEvent.click(
      await within(await screen.findByRole("main")).findByRole("button", { name: "Sign in" })
    );

    expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();
  });
});

// The main links, the account button and its menu, and the pages' addresses

const maya = { id: "g-maya", firstName: "Maya", lastName: "Rivera", isAdmin: false };

// Draw the nav bar (and the page under it) at `route`
const renderNav = (route: string, user: object = {}) =>
  renderWithApp(
    <>
      <NavbarComp />
      <Where />
    </>,
    {
      route,
      state: { user },
      respond: (config) => {
        if (config.url === "/Login") return Object.keys(user).length ? { status: 200, data: user } : 401;
        if (config.url === "/Logout") return 200;
        return { status: 200, data: [] };
      },
    }
  );

const mainLinks = () =>
  within(screen.getByRole("navigation", { name: "Main" }))
    .getAllByRole("link")
    .map((link) => `${link.textContent} ${link.getAttribute("href")}`);

describe("the nav bar's links", () => {
  it("a signed-in student gets Today, My sentences and Gallery", () => {
    renderNav("/", maya);

    expect(mainLinks()).toEqual(["Today /", "My sentences /MySentences", "Gallery /Gallery"]);
  });

  it("a teacher also gets Teacher", () => {
    renderNav("/", { ...maya, isAdmin: true });

    expect(mainLinks()).toEqual([
      "Today /",
      "My sentences /MySentences",
      "Gallery /Gallery",
      "Teacher /admin",
    ]);
  });

  it("a visitor gets Home (for the phone's bar), Gallery and About, and a Sign in button", async () => {
    renderNav("/", {});

    expect(mainLinks()).toEqual(["Home /", "Gallery /Gallery", "About /about"]);
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("paper-nav__phone-only");

    await userEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Sign in" }));
    // The pop-up (the Welcome page under it has a sign-in button of its own)
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("marks the page you're on", async () => {
    renderNav("/Gallery", maya);

    expect(screen.getByRole("link", { name: "Gallery" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current");
  });

  it("the logo leads home", () => {
    renderNav("/Gallery", maya);

    expect(screen.getByRole("link", { name: "Show ME: home" })).toHaveAttribute("href", "/");
  });

  // On a phone the links are a bar along the bottom; the Write page hides it
  // (the keyboard needs the room) and gives its space back
  it("steps the phone's bar aside on the Write page only", async () => {
    renderNav("/Write", maya);
    const nav = screen.getByRole("navigation", { name: "Main" });

    expect(nav).toHaveClass("paper-nav__links--away");
    expect(screen.getByRole("main")).toHaveClass("paper-page--full");

    await userEvent.click(within(nav).getByRole("link", { name: "Gallery" }));

    expect(nav).not.toHaveClass("paper-nav__links--away");
    expect(screen.getByRole("main")).not.toHaveClass("paper-page--full");
  });
});

describe("the account button", () => {
  it("shows the first and last initial, and opens a menu with the name, About and Log out", async () => {
    renderNav("/", maya);
    const button = screen.getByRole("button", { name: "Account: Maya Rivera" });

    expect(button).toHaveTextContent("MR");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();

    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Maya Rivera")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("shows one initial for someone without a last name", () => {
    renderNav("/", { id: "g-zoe", firstName: "Zoe" });

    expect(screen.getByRole("button", { name: "Account: Zoe" })).toHaveTextContent(/^Z$/);
  });

  it("closes on Escape (keeping the keyboard on the button) and on a press elsewhere", async () => {
    const user = userEvent.setup();
    renderNav("/", maya);
    const button = screen.getByRole("button", { name: "Account: Maya Rivera" });

    await user.click(button);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    await user.click(button);
    await user.click(screen.getByTestId("where"));
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  it("About closes the menu and opens the page, keeping the keyboard on the button", async () => {
    renderNav("/", maya);
    const button = screen.getByRole("button", { name: "Account: Maya Rivera" });

    await userEvent.click(button);
    await userEvent.click(screen.getByRole("link", { name: "About" }));

    expect(screen.getByTestId("where")).toHaveTextContent(/^\/about$/);
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("closes when the keyboard tabs out of it", async () => {
    const user = userEvent.setup();
    renderNav("/", maya);
    const button = screen.getByRole("button", { name: "Account: Maya Rivera" });

    await user.click(button);
    await user.tab({ shift: true }); // back to the Gallery link

    expect(screen.getByRole("link", { name: "Gallery" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("Log out signs the student out and goes home", async () => {
    const { store } = renderNav("/Gallery", maya);

    await userEvent.click(screen.getByRole("button", { name: "Account: Maya Rivera" }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(store.getState().user).toEqual({}));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("the pages' old addresses", () => {
  it("/Collections forwards to /Gallery", async () => {
    renderNav("/Collections", {});

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/Gallery$/));
    expect(await screen.findByRole("heading", { name: "Show ME gallery" })).toBeInTheDocument();
  });

  it("/MyPage forwards to /MySentences", async () => {
    renderNav("/MyPage", maya);

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/MySentences$/));
    expect(await screen.findByRole("heading", { name: "My sentences" })).toBeInTheDocument();
  });
});
