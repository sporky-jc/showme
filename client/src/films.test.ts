import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FILMS } from "./films";

// Every film in films.ts has its three files in public/films/
describe("films", () => {
  it.each(Object.entries(FILMS))("%s has its video, captions and picture", (_name, film) => {
    for (const file of [film!.video, film!.captions, film!.poster]) {
      expect(existsSync(`public${file}`), file).toBe(true);
    }
  });
});
