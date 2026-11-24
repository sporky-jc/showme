import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { addCaptions, readCaptions } from "./captions";
import { FILMS } from "./films";

describe("readCaptions", () => {
  it("reads each line with its start and end in seconds", () => {
    const vtt = "WEBVTT\n\n00:01.000 --> 00:02.930\nIt was raining.\n\n2\n00:01:03.050 --> 00:01:07.500 align:center\nTwo\nrows\n";
    expect(readCaptions(vtt)).toEqual([
      { start: 1, end: 2.93, text: "It was raining." },
      { start: 63.05, end: 67.5, text: "Two\nrows" },
    ]);
  });

  it.each(Object.entries(FILMS))("%s has captions it can read", (_name, film) => {
    const lines = readCaptions(readFileSync(`public${film!.captions}`, "utf8"));
    expect(lines.length).toBeGreaterThan(3);
    expect(lines[lines.length - 1].end).toBeLessThanOrEqual(film!.seconds + 1);
  });
});

describe("addCaptions", () => {
  it("adds the lines to the video, turned off", async () => {
    const cues: unknown[] = [];
    const track = { mode: "hidden", addCue: (cue: unknown) => cues.push(cue) };
    const video = { addTextTrack: vi.fn(() => track) } as unknown as HTMLVideoElement;
    vi.stubGlobal("VTTCue", function (this: object, startTime: number, endTime: number, text: string) { Object.assign(this, { startTime, endTime, text }); });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "WEBVTT\n\n00:01.000 --> 00:02.000\nHello.\n" })));
    await addCaptions(video, "/films/x/x.vtt");
    expect(video.addTextTrack).toHaveBeenCalledWith("captions", "English", "en");
    expect(track.mode).toBe("disabled");
    expect(cues).toEqual([{ startTime: 1, endTime: 2, text: "Hello." }]);
    vi.unstubAllGlobals();
  });

  it("leaves the video alone when the captions can't be read", async () => {
    const video = { addTextTrack: vi.fn() } as unknown as HTMLVideoElement;
    vi.stubGlobal("VTTCue", class {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(addCaptions(video, "/films/x/x.vtt")).resolves.toBeUndefined();
    expect(video.addTextTrack).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
