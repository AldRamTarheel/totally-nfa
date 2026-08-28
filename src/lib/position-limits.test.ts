import { describe, it, expect } from "vitest";
import { isAtCapacity, MAX_ACTIVE_POSITIONS } from "@/lib/position-limits";

describe("isAtCapacity", () => {
  it("is false below the cap", () => {
    expect(isAtCapacity(MAX_ACTIVE_POSITIONS - 1)).toBe(false);
  });

  it("is true exactly at the cap", () => {
    expect(isAtCapacity(MAX_ACTIVE_POSITIONS)).toBe(true);
  });

  it("is true above the cap (shouldn't happen, but must not under-count)", () => {
    expect(isAtCapacity(MAX_ACTIVE_POSITIONS + 5)).toBe(true);
  });

  it("is false for zero active positions", () => {
    expect(isAtCapacity(0)).toBe(false);
  });
});
