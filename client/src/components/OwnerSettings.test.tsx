import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { InternalAxiosRequestConfig } from "axios";
import OwnerSettings from "./OwnerSettings";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";

// The Owner settings on the Teacher page: only the site's owner gets an
// answer, so only the owner sees them. The AI highlights switch turns the
// sense tagger on or off.

const tagger = (on: boolean, extra: object = {}) => ({
  senseTagger: { on, ready: true, today: 12, perDay: 150, ...extra },
});

const renderSettings = ({
  settings = { status: 200, data: tagger(false) } as Outcome,
  change = (config: InternalAxiosRequestConfig): Outcome => ({
    status: 200,
    data: tagger(JSON.parse(config.data).senseTagger),
  }),
}: {
  settings?: Outcome;
  change?: (config: InternalAxiosRequestConfig) => Outcome;
} = {}) => {
  const requests: InternalAxiosRequestConfig[] = [];
  const onSaid = vi.fn();
  const view = renderWithApp(<OwnerSettings onSaid={onSaid} />, {
    respond: (config) => {
      requests.push(config);
      if (config.url !== "/Admin/owner") return 404;
      return config.method === "patch" ? change(config) : settings;
    },
  });
  const patches = () => requests.filter((r) => r.method === "patch").map((r) => JSON.parse(r.data));
  return { ...view, onSaid, patches, requests };
};

describe("OwnerSettings", () => {
  it("shows the AI highlights switch, off, with today's count", async () => {
    renderSettings();

    expect(await screen.findByRole("heading", { name: "Owner settings" })).toBeInTheDocument();
    expect(screen.getByText("AI highlights: off.")).toBeInTheDocument();
    expect(screen.getByText("Read today: 12 of 150 sentences.")).toBeInTheDocument();
    expect(screen.queryByText(/Cloudflare keys/)).not.toBeInTheDocument();
  });

  it("turns AI highlights on, and off again", async () => {
    const { onSaid, patches } = renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: "Turn AI highlights on" }));
    expect(await screen.findByText("AI highlights: on.")).toBeInTheDocument();
    expect(onSaid).toHaveBeenLastCalledWith("AI highlights are on.");

    fireEvent.click(screen.getByRole("button", { name: "Turn AI highlights off" }));
    expect(await screen.findByText("AI highlights: off.")).toBeInTheDocument();
    expect(patches()).toEqual([{ senseTagger: true }, { senseTagger: false }]);
  });

  it("says when the Cloudflare keys aren't set", async () => {
    renderSettings({ settings: { status: 200, data: tagger(false, { ready: false }) } });
    expect(await screen.findByText("It needs the Cloudflare keys before it can run.")).toBeInTheDocument();
  });

  it("shows nothing to anyone but the owner (the server says 403)", async () => {
    const { requests } = renderSettings({ settings: { status: 403, data: { message: "Only the site's owner can use these settings." } } });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(screen.queryByRole("heading", { name: "Owner settings" })).not.toBeInTheDocument();
  });

  it("says so when a change doesn't save, and keeps the switch as it was", async () => {
    renderSettings({ change: () => 500 });

    fireEvent.click(await screen.findByRole("button", { name: "Turn AI highlights on" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't change.");
    expect(screen.getByText("AI highlights: off.")).toBeInTheDocument();
  });
});
