import { describe, expect, it } from "vitest";
import { fail, ok, type RuleResult } from "./result.ts";

describe("RuleResult helpers", () => {
  it("wraps a success value", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });

  it("wraps a failure reason", () => {
    expect(fail("not_enough_gold")).toEqual({ ok: false, reason: "not_enough_gold" });
  });

  it("narrows on the ok flag", () => {
    const describe = (result: RuleResult<number, "too_poor">) =>
      result.ok ? `got ${result.value}` : `failed: ${result.reason}`;
    expect(describe(ok(5))).toBe("got 5");
    expect(describe(fail("too_poor"))).toBe("failed: too_poor");
  });
});
