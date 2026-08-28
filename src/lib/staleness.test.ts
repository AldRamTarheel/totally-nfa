import { describe, it, expect } from "vitest";
import { computeDaysHeld, isStale, STALE_THRESHOLD_DAYS } from "@/lib/staleness";

describe("computeDaysHeld", () => {
  it("returns 0 for a position opened right now", () => {
    const now = new Date("2026-08-27T12:00:00Z");
    expect(computeDaysHeld(now, now)).toBe(0);
  });

  it("floors partial days", () => {
    const created = new Date("2026-08-27T00:00:00Z");
    const now = new Date("2026-08-27T23:00:00Z"); // 23h later, still day 0
    expect(computeDaysHeld(created, now)).toBe(0);
  });

  it("counts whole days elapsed", () => {
    const created = new Date("2026-08-01T00:00:00Z");
    const now = new Date("2026-08-11T00:00:00Z");
    expect(computeDaysHeld(created, now)).toBe(10);
  });

  it("accepts an ISO string same as a Date", () => {
    const now = new Date("2026-08-11T00:00:00Z");
    expect(computeDaysHeld("2026-08-01T00:00:00Z", now)).toBe(10);
  });
});

describe("isStale", () => {
  it("is false just under the threshold", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const now = new Date(created.getTime() + (STALE_THRESHOLD_DAYS - 1) * 86400000);
    expect(isStale(created, now)).toBe(false);
  });

  it("is true once the threshold is reached", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const now = new Date(created.getTime() + STALE_THRESHOLD_DAYS * 86400000);
    expect(isStale(created, now)).toBe(true);
  });
});
