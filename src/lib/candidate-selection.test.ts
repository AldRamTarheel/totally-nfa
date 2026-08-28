import { describe, it, expect } from "vitest";
import { findFreshCandidate } from "@/lib/candidate-selection";
import type { InsiderCandidate } from "@/lib/types";

function candidate(ticker: string): InsiderCandidate {
  return { ticker, insiderSentiment: "bullish", rationale: "test" };
}

describe("findFreshCandidate", () => {
  it("returns the top-ranked candidate when none are already active", () => {
    const candidates = [candidate("AAA"), candidate("BBB")];
    expect(findFreshCandidate(candidates, new Set())?.ticker).toBe("AAA");
  });

  it("skips a candidate that's already an active pick", () => {
    const candidates = [candidate("BRVE"), candidate("DPC")];
    expect(findFreshCandidate(candidates, new Set(["BRVE"]))?.ticker).toBe("DPC");
  });

  it("returns undefined when every candidate is already active — this is the regression this module fixed (BRVE staying top-ranked for days)", () => {
    const candidates = [candidate("BRVE")];
    expect(findFreshCandidate(candidates, new Set(["BRVE"]))).toBeUndefined();
  });

  it("returns undefined for an empty candidate list", () => {
    expect(findFreshCandidate([], new Set())).toBeUndefined();
  });
});
