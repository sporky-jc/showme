import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import Login from "./Login";
import { renderWithApp } from "../test/testUtils";
import type { Respond } from "../test/testUtils";

// A pretend Google sign-in script: records what the page asks it to do.
let google: {
  accounts: {
    id: {
      initialize: Mock<(config: google.accounts.id.IdConfiguration) => void>;
      renderButton: Mock;
      prompt: Mock;
    };
  };
};
beforeEach(() => {
  google = {
    accounts: {
      id: {
        initialize: vi.fn(),
        renderButton: vi.fn(),
        prompt: vi.fn(),
      },
    },
  };
  vi.stubGlobal("google", google);
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Shows the current address, so tests can see where Login navigated to
const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

const renderLogin = ({
  onHide = vi.fn(),
  respond,
  route = "/Collections",
}: { onHide?: Mock<() => void>; respond?: Respond; route?: string } = {}) => {
  const requests: InternalAxiosRequestConfig[] = [];
  const view = renderWithApp(
    <Routes>
      <Route path="*" element={<><Login show onHide={onHide} /><Where /></>} />
    </Routes>,
    {
      respond: (config) => {
        requests.push(config);
        if (respond) return respond(config);
        if (config.url === "/auth") return { status: 200, data: { user: {} } };
        if (config.url === "/Login") return { status: 200, data: { firstName: "Ada" } };
        return 200;
      },
      route,
    }
  );
  return { ...view, requests, onHide };
};

describe("Login", () => {
  it("sets up Google's sign-in button with our client id", async () => {
    renderLogin();

    await waitFor(() => expect(google.accounts.id.initialize).toHaveBeenCalled());
    expect(google.accounts.id.initialize.mock.calls[0][0].client_id).toBe("test-client-id");
    expect(google.accounts.id.renderButton).toHaveBeenCalledWith(
      document.getElementById("signInDiv"),
      expect.anything()
    );
  });

  it("after Google signs someone in: logs in with our backend, closes, and goes to Today (the home page)", async () => {
    const { requests, onHide } = renderLogin();
    await waitFor(() => expect(google.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = google.accounts.id.initialize.mock.calls[0][0];

    await act(() => callback!({ credential: "google-id-token", select_by: "btn" }));

    const auth = requests.find((r) => r.url === "/auth");
    expect(JSON.parse(auth!.data)).toEqual({ token: "google-id-token" });
    expect(requests.some((r) => r.url === "/Login")).toBe(true);
    expect(onHide).toHaveBeenCalled();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
  });

  // MyPage asks a visitor to sign in, and then shows their sentences
  it("stays on MyPage when the sign-in started there", async () => {
    renderLogin({ route: "/MyPage" });
    await waitFor(() => expect(google.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = google.accounts.id.initialize.mock.calls[0][0];

    await act(() => callback!({ credential: "google-id-token", select_by: "btn" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/MyPage");
  });

  it("stays put if our backend rejects the sign-in", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { onHide } = renderLogin({ respond: (c) => (c.url === "/auth" ? 401 : 200) });
    await waitFor(() => expect(google.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = google.accounts.id.initialize.mock.calls[0][0];

    await act(() => callback!({ credential: "bad", select_by: "btn" }));

    expect(onHide).not.toHaveBeenCalled();
    expect(screen.getByTestId("where")).toHaveTextContent("/Collections");
  });

  it("is a dialog that says why to sign in, with Google's button in it", async () => {
    renderLogin();

    const dialog = await screen.findByRole("dialog", { name: "Hi! Ready to write?" });
    expect(dialog).toHaveTextContent("Sign in to save your Show sentences and get them into the gallery.");
    expect(dialog).toContainElement(document.getElementById("signInDiv"));
  });

  it("closes with Not now, the close button, Escape, or a press outside the card", async () => {
    const { onHide } = renderLogin();
    const dialog = await screen.findByRole("dialog", { name: "Hi! Ready to write?" });

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true })); // Escape
    fireEvent.click(dialog); // the dimmed page around the card
    expect(onHide).toHaveBeenCalledTimes(4);

    // A press inside the card doesn't
    fireEvent.click(screen.getByRole("heading", { name: "Hi! Ready to write?" }));
    expect(onHide).toHaveBeenCalledTimes(4);
  });

  it("says it's signing in while our backend answers", async () => {
    let answer: (value: number) => void = () => {};
    renderLogin({
      respond: (c) => (c.url === "/auth" ? new Promise<number>((resolve) => (answer = resolve)) : 200),
    });
    await waitFor(() => expect(google.accounts.id.initialize).toHaveBeenCalled());
    const { callback } = google.accounts.id.initialize.mock.calls[0][0];

    act(() => {
      void callback!({ credential: "google-id-token", select_by: "btn" });
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Signing you in…");
    await act(async () => answer(200));
  });

  it("doesn't set up Google's button if the popup closes within 300ms", () => {
    vi.useFakeTimers();
    const { unmount } = renderLogin();

    unmount();
    act(() => vi.advanceTimersByTime(1000));

    expect(google.accounts.id.initialize).not.toHaveBeenCalled();
  });
});
