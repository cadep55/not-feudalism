import { describe, expect, it } from "vitest";
import { isCompatibleProtocol, PROTOCOL_VERSION } from "./version.ts";

describe("isCompatibleProtocol", () => {
  it("accepts the current version", () => {
    expect(isCompatibleProtocol(PROTOCOL_VERSION)).toBe(true);
  });

  it("rejects any other version", () => {
    expect(isCompatibleProtocol(PROTOCOL_VERSION + 1)).toBe(false);
    expect(isCompatibleProtocol(PROTOCOL_VERSION - 1)).toBe(false);
  });
});
