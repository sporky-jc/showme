import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { lineAt, loadCaptions, readCaptions } from "./captions";
import { ALL_FILMS } from "./films";

describe("readCaptions", () => {
  it("reads each line with its start and end in seconds", () => {
    const vtt = "WEBVTT\n\n00:01.000 --> 00:02.930\nIt was raining.\n\n2\n00:01:03.050 --> 00:01:07.500 align:center\nTwo\nrows\n";
    expect(readCaptions(vtt)).toEqual([
      { start: 1, end: 2.93, text: "It was raining." },
      { start: 63.05, end: 67.5, text: "Two\nrows" },
    ]);
  });

  it.each(Object.entries(ALL_FILMS))("%s has captions it can read", (_name, film) => {
    const lines = readCaptions(readFileSync(`public${film.captions}`, "utf8"));
    expect(lines.length).toBeGreaterThan(3);
    expect(lines[lines.length - 1].end).toBeLessThanOrEqual(film.seconds + 1);
  });
});

describe("loadCaptions", () => {
  it("reads the lines from the file", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "WEBVTT\n\n00:01.000 --> 00:02.000\nHello.\n" })));
    expect(await loadCaptions("/films/x/x.vtt")).toEqual([{ start: 1, end: 2, text: "Hello." }]);
    vi.unstubAllGlobals();
  });

  it("gives no lines when the file can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await loadCaptions("/films/x/x.vtt")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, text: async () => "<html>" })));
    expect(await loadCaptions("/films/x/x.vtt")).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe("lineAt", () => {
  it("finds the line being said, or nothing between lines", () => {
    const lines = [{ start: 1, end: 2, text: "One." }, { start: 3, end: 4, text: "Two." }];
    expect(lineAt(lines, 0.5)).toBe("");
    expect(lineAt(lines, 1)).toBe("One.");
    expect(lineAt(lines, 2.5)).toBe("");
    expect(lineAt(lines, 3.9)).toBe("Two.");
  });
});
