import { describe, expect, it } from "vitest";
import { FAILURE_REASONS, isFailureReason } from "./reasons.ts";

describe("isFailureReason", () => {
  it("accepts every known reason", () => {
    for (const reason of FAILURE_REASONS) expect(isFailureReason(reason)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isFailureReason("something_else")).toBe(false);
    expect(isFailureReason(undefined)).toBe(false);
  });
});
