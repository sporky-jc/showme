import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import type { InternalAxiosRequestConfig } from "axios";
import NavbarComp from "./NavbarComp";
import { renderWithApp, type Outcome } from "../test/testUtils";
import { REVIEW_COUNT_EVERY_MS } from "./useReviewCount";

// The badge on the Teacher link: how many sentences to check in on (red),
// or else how many wait (grey), so a teacher notices a worrying sentence
// without opening the Teacher page

const teacher = { id: "g-ms-k", firstName: "Kim", lastName: "Lee", isAdmin: true };
const student = { id: "g-maya", firstName: "Maya", lastName: "Rivera", isAdmin: false };

// Draw the nav bar on the home page for `user`, the pretend server answering
// GET /Admin/count with `count`. Returns every address asked for.
const renderNav = (user: object, count: () => Outcome) => {
  const asked: string[] = [];
  const view = renderWithApp(<NavbarComp />, {
    route: "/",
    state: { user },
    respond: (config: InternalAxiosRequestConfig) => {
      asked.push(config.url ?? "");
      if (config.url === "/Admin/count") return count();
      if (config.url === "/Login") return { status: 200, data: user };
      return { status: 200, data: [] };
    },
  });
  return { ...view, asked };
};

const teacherLink = () =>
  within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Teacher" });
const badge = () => document.querySelector(".paper-nav__badge");

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
};

afterEach(() => {
  vi.useRealTimers();
  // Back to jsdom's own (always "visible")
  delete (document as { visibilityState?: unknown }).visibilityState;
});

describe("the Teacher link's badge", () => {
  it("shows how many to check in on, in red, keeping the link's name and adding the count as its description", async () => {
    document.title = "Show ME";
    renderNav(teacher, () => ({ status: 200, data: { checkIn: 2, waiting: 5 } }));

    await waitFor(() => expect(badge()).toHaveTextContent(/^2/));
    expect(badge()).not.toHaveClass("paper-nav__badge--quiet");
    // Exactly "Teacher", as automated browser tests find it
    expect(teacherLink()).toHaveTextContent(/^Teacher$/);
    expect(teacherLink()).toHaveAccessibleDescription("2 to check in, 5 waiting");
    expect(document.title).toBe("(2) Show ME");
  });

  it("shows only how many wait, in grey, when there's none to check in on", async () => {
    renderNav(teacher, () => ({ status: 200, data: { checkIn: 0, waiting: 3 } }));

    await waitFor(() => expect(badge()).toHaveTextContent(/^3/));
    expect(badge()).toHaveClass("paper-nav__badge--quiet");
    expect(teacherLink()).toHaveAccessibleDescription("3 waiting");
    expect(document.title).not.toMatch(/^\(/);
  });

  it("isn't shown when nothing waits", async () => {
    const { asked } = renderNav(teacher, () => ({ status: 200, data: { checkIn: 0, waiting: 0 } }));

    await waitFor(() => expect(asked).toContain("/Admin/count"));
    expect(badge()).toBeNull();
    expect(teacherLink()).not.toHaveAttribute("aria-describedby");
  });

  // Until the backend with the count is deployed, and on pull request
  // previews (the staging backend), the request fails: no badge, no message
  it.each([404, 500, "offline" as const])("fails silently (%s)", async (outcome) => {
    const { asked } = renderNav(teacher, () => outcome);

    await waitFor(() => expect(asked).toContain("/Admin/count"));
    expect(badge()).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(teacherLink()).toBeInTheDocument();
  });

  it("is never asked for by a student or a visitor", async () => {
    const forStudent = renderNav(student, () => 403);
    // Give any request time to go out
    const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await waitFor(() => expect(forStudent.asked).toContain("/MyPage"));
    await settle();
    forStudent.unmount();
    const forVisitor = renderNav({}, () => 403);
    await settle();

    expect(forStudent.asked).not.toContain("/Admin/count");
    expect(forVisitor.asked).not.toContain("/Admin/count");
    expect(badge()).toBeNull();
  });

  it("asks again every few minutes while the tab shows, not while it's hidden, and at once when it shows again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let checkIn = 1;
    const { asked } = renderNav(teacher, () => ({ status: 200, data: { checkIn, waiting: 4 } }));
    const counted = () => asked.filter((url) => url === "/Admin/count").length;
    await waitFor(() => expect(badge()).toHaveTextContent(/^1/));
    const first = counted();

    checkIn = 2;
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_COUNT_EVERY_MS));
    await waitFor(() => expect(badge()).toHaveTextContent(/^2/));
    expect(counted()).toBe(first + 1);

    act(() => setVisibility("hidden"));
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_COUNT_EVERY_MS * 3));
    expect(counted()).toBe(first + 1);

    checkIn = 3;
    act(() => setVisibility("visible"));
    await waitFor(() => expect(badge()).toHaveTextContent(/^3/));
    expect(counted()).toBe(first + 2);
  });

  it("asks again when the Teacher page's queue changes, as it does after a decision", async () => {
    let checkIn = 1;
    const { store } = renderNav(teacher, () => ({ status: 200, data: { checkIn, waiting: checkIn } }));
    await waitFor(() => expect(badge()).toHaveTextContent(/^1/));

    checkIn = 0;
    act(() => store.dispatch({ type: "UPDATE_APPROVAL_SENTENCES", payload: [] }));

    await waitFor(() => expect(badge()).toBeNull());
  });
});
