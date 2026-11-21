import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { InternalAxiosRequestConfig } from "axios";
import ReviewerSwitch from "./ReviewerSwitch";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";

// Scribbles' off switch on the Teacher page: whether he's reading new
// sentences, and pausing him (after asking) or turning him back on

const ON = { mode: "suggest", paused: false };
const PAUSED = { mode: "suggest", paused: true, pausedAt: "2026-11-20T09:30:00.000Z" };

const renderSwitch = ({
  status = { status: 200, data: ON } as Outcome,
  change = (config: InternalAxiosRequestConfig): Outcome => ({
    status: 200,
    data: JSON.parse(config.data).paused ? PAUSED : ON,
  }),
}: {
  status?: Outcome;
  change?: (config: InternalAxiosRequestConfig) => Outcome | Promise<Outcome>;
} = {}) => {
  const requests: InternalAxiosRequestConfig[] = [];
  const onSaid = vi.fn();
  const view = renderWithApp(<ReviewerSwitch onSaid={onSaid} />, {
    respond: (config) => {
      requests.push(config);
      if (config.url !== "/Admin/reviewer") return 404;
      return config.method === "patch" ? change(config) : status;
    },
  });
  const patches = () => requests.filter((r) => r.method === "patch").map((r) => JSON.parse(r.data));
  return { ...view, onSaid, patches, requests };
};

const button = (name: string) => screen.getByRole("button", { name });

describe("ReviewerSwitch", () => {
  it("says Scribbles is on, and asks before pausing him", async () => {
    const { onSaid, patches } = renderSwitch();

    expect(await screen.findByText("Scribbles: on.")).toBeInTheDocument();
    fireEvent.click(button("Pause Scribbles"));

    // Nothing is sent until the teacher says yes
    expect(screen.getByRole("group", { name: "Pause Scribbles?" })).toBeInTheDocument();
    expect(button("Yes, pause Scribbles")).toHaveFocus();
    expect(patches()).toEqual([]);

    fireEvent.click(button("Yes, pause Scribbles"));

    expect(await screen.findByText("Scribbles: paused.")).toBeInTheDocument();
    expect(patches()).toEqual([{ paused: true }]);
    expect(onSaid).toHaveBeenCalledWith("Scribbles is paused.");
    await waitFor(() => expect(button("Turn Scribbles back on")).toHaveFocus());
  });

  it("changes nothing when the teacher keeps him on", async () => {
    const { patches } = renderSwitch();

    fireEvent.click(await screen.findByRole("button", { name: "Pause Scribbles" }));
    fireEvent.click(button("Keep Scribbles on"));

    expect(screen.queryByRole("group", { name: "Pause Scribbles?" })).not.toBeInTheDocument();
    expect(button("Pause Scribbles")).toHaveFocus();
    expect(patches()).toEqual([]);
  });

  it("says since when he's paused, and turns him back on without asking", async () => {
    const { onSaid, patches } = renderSwitch({ status: { status: 200, data: PAUSED } });

    expect(await screen.findByText("Scribbles: paused.")).toBeInTheDocument();
    expect(screen.getByText(/since /)).toBeInTheDocument();
    fireEvent.click(button("Turn Scribbles back on"));

    expect(await screen.findByText("Scribbles: on.")).toBeInTheDocument();
    expect(patches()).toEqual([{ paused: false }]);
    expect(onSaid).toHaveBeenCalledWith("Scribbles is back on.");
  });

  it("shows nothing when the deploy has him off (the real site, until he's on): there's nothing to switch", async () => {
    const { container, requests } = renderSwitch({ status: { status: 200, data: { mode: "off", paused: false } } });

    await waitFor(() => expect(requests).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // A pull request's preview uses the staging backend, which may not have
  // the switch yet
  it.each([
    ["the server doesn't have it", 404 as Outcome],
    ["the server fails", 500 as Outcome],
    ["there's no answer", "offline" as Outcome],
    ["the answer isn't the switch", { status: 200, data: {} } as Outcome],
  ])("shows nothing when %s", async (_, status) => {
    const { container, requests } = renderSwitch({ status });

    await waitFor(() => expect(requests).toHaveLength(1));
    // Give the answer a moment to arrive
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("says so when a change didn't save, and stays as it was", async () => {
    renderSwitch({ change: () => 500 });

    fireEvent.click(await screen.findByRole("button", { name: "Pause Scribbles" }));
    fireEvent.click(button("Yes, pause Scribbles"));

    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't change.");
    expect(screen.getByText("Scribbles: on.")).toBeInTheDocument();
    // Still asking, so the teacher can press again
    await waitFor(() => expect(button("Yes, pause Scribbles")).toHaveFocus());
  });

  it("gives the server's reason when it refuses (a test account can't pause him)", async () => {
    renderSwitch({ change: () => ({ status: 403, data: { message: "Test accounts can't pause Scribbles." } }) });

    fireEvent.click(await screen.findByRole("button", { name: "Pause Scribbles" }));
    fireEvent.click(button("Yes, pause Scribbles"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Test accounts can't pause Scribbles.");
  });
});
