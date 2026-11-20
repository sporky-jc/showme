import { describe, expect, it, vi } from "vitest";
import { logger } from "firebase-functions/logger";

// index.ts is what Firebase deploys (built into lib/index.js). Importing it
// here (without a database connection string) checks what gets exported and
// with which settings.
// __endpoint is the description Firebase reads at deploy.
// (Without a connection string it logs an error; keep that out of the output.)
vi.spyOn(logger, "error").mockImplementation(() => {});
const exported = await import("../index.js");

describe("deployed functions", () => {
  it("deploys exactly two functions: apiv2 and the scheduled reviewer", () => {
    expect(Object.keys(exported).sort()).toEqual(["apiv2", "reviewer"]);
  });

  it("runs the reviewer every 10 minutes, one run at a time, in us-central1", () => {
    const { reviewer } = exported;
    expect(reviewer.__endpoint.platform).toBe("gcfv2");
    expect(reviewer.__endpoint.region).toEqual(["us-central1"]);
    expect(reviewer.__endpoint.scheduleTrigger).toMatchObject({ schedule: "every 10 minutes" });
    expect(reviewer.__endpoint.maxInstances).toBe(1);
  });

  it("exports apiv2 as a 2nd generation HTTPS function in us-central1", () => {
    const { apiv2 } = exported;
    expect(apiv2.__endpoint.platform).toBe("gcfv2");
    expect(apiv2.__endpoint.region).toEqual(["us-central1"]);
    expect(apiv2.__endpoint.httpsTrigger).toBeDefined();
  });

  it("caps apiv2 at 10 instances, each handling up to 80 requests", () => {
    const { apiv2 } = exported;
    expect(apiv2.__endpoint.maxInstances).toBe(10);
    expect(apiv2.__endpoint.concurrency).toBe(80);
  });
});
