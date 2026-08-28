import { describe, it, expect } from "vitest";
import { computePnlPercent, hasHitInvalidation, hasHitTarget } from "@/lib/pnl";

describe("computePnlPercent", () => {
  it("computes a positive move", () => {
    expect(computePnlPercent(100, 110)).toBeCloseTo(10);
  });

  it("computes a negative move", () => {
    expect(computePnlPercent(100, 90)).toBeCloseTo(-10);
  });

  it("returns 0 for no move", () => {
    expect(computePnlPercent(100, 100)).toBe(0);
  });

  it("returns 0 (not NaN/Infinity) when alertPrice is 0, guarding the divide-by-zero", () => {
    expect(computePnlPercent(0, 50)).toBe(0);
  });
});

describe("hasHitInvalidation", () => {
  describe("bullish thesis (invalidation below alert)", () => {
    it("hits when price falls below the invalidation level", () => {
      expect(hasHitInvalidation(100, 90, 85)).toBe(true);
    });

    it("does not hit when price is still above the invalidation level", () => {
      expect(hasHitInvalidation(100, 90, 95)).toBe(false);
    });

    it("hits on exact boundary equality", () => {
      expect(hasHitInvalidation(100, 90, 90)).toBe(true);
    });
  });

  describe("bearish-framed thesis (invalidation above alert)", () => {
    it("hits when price rises above the invalidation level", () => {
      expect(hasHitInvalidation(100, 110, 115)).toBe(true);
    });

    it("does not hit when price is still below the invalidation level", () => {
      expect(hasHitInvalidation(100, 110, 105)).toBe(false);
    });

    it("hits on exact boundary equality", () => {
      expect(hasHitInvalidation(100, 110, 110)).toBe(true);
    });
  });
});

describe("hasHitTarget", () => {
  describe("bullish thesis (target above alert)", () => {
    it("hits when price rises at or above the target", () => {
      expect(hasHitTarget(100, 120, 125)).toBe(true);
    });

    it("does not hit when price is still below the target", () => {
      expect(hasHitTarget(100, 120, 115)).toBe(false);
    });

    it("hits on exact boundary equality", () => {
      expect(hasHitTarget(100, 120, 120)).toBe(true);
    });
  });

  describe("bearish-framed thesis (target below alert)", () => {
    it("hits when price falls at or below the target", () => {
      expect(hasHitTarget(100, 80, 75)).toBe(true);
    });

    it("does not hit when price is still above the target", () => {
      expect(hasHitTarget(100, 80, 85)).toBe(false);
    });

    it("hits on exact boundary equality", () => {
      expect(hasHitTarget(100, 80, 80)).toBe(true);
    });
  });
});
