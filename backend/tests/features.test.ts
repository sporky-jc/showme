import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { FEATURES, features } from "../config/features.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

const allOff = Object.fromEntries(FEATURES.map((name) => [name, false]));

// Feature flags: off unless this backend's FEATURES names them, so
// production stays simple and staging can try things
describe("features", () => {
  it("has every feature off when FEATURES is missing or empty", () => {
    expect(features({})).toEqual(allOff);
    expect(features({ FEATURES: "" })).toEqual(allOff);
  });

  it("turns on only the features FEATURES names", () => {
    expect(features({ FEATURES: "senseHighlights" })).toEqual({ ...allOff, senseHighlights: true });
    expect(features({ FEATURES: " senseCoach , senseHighlights " })).toEqual({
      ...allOff,
      senseCoach: true,
      senseHighlights: true,
    });
  });

  it("ignores names it doesn't know", () => {
    expect(features({ FEATURES: "flyingCars,SENSEHIGHLIGHTS,__proto__" })).toEqual(allOff);
  });
});

describe("GET /features", () => {
  it("answers anyone with every flag, all off by default", async () => {
    vi.stubEnv("FEATURES", "");

    const res = await request(app).get("/features");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(allOff);
  });

  it("says which features this backend has on", async () => {
    vi.stubEnv("FEATURES", "senseCoach");

    const res = await request(app).get("/features");

    expect(res.body).toEqual({ ...allOff, senseCoach: true });
  });
});
