import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.ts";
import { ChatSend, MoveTo, parseClientMessage } from "./messages.ts";

describe("MoveTo", () => {
  it("accepts in-range integer coordinates", () => {
    expect(MoveTo.parse({ x: 0, y: LIMITS.maxCoordinate })).toEqual({
      x: 0,
      y: LIMITS.maxCoordinate,
    });
  });

  it.each([
    ["negative", { x: -1, y: 0 }],
    ["too large", { x: LIMITS.maxCoordinate + 1, y: 0 }],
    ["fractional", { x: 1.5, y: 0 }],
    ["string numbers", { x: "1", y: "2" }],
    ["NaN", { x: Number.NaN, y: 0 }],
    ["Infinity", { x: Number.POSITIVE_INFINITY, y: 0 }],
    ["missing y", { x: 1 }],
    ["extra fields", { x: 1, y: 2, teleport: true }],
  ])("rejects %s", (_label, payload) => {
    expect(MoveTo.safeParse(payload).success).toBe(false);
  });
});

describe("ChatSend", () => {
  it("trims the text", () => {
    expect(ChatSend.parse({ text: "  hello  " })).toEqual({ text: "hello" });
  });

  it.each([
    ["empty", { text: "" }],
    ["whitespace only", { text: "   " }],
    ["too long", { text: "a".repeat(LIMITS.chatMaxLength + 1) }],
    ["not a string", { text: 123 }],
  ])("rejects %s", (_label, payload) => {
    expect(ChatSend.safeParse(payload).success).toBe(false);
  });
});

describe("parseClientMessage", () => {
  it("returns the parsed payload for a valid message", () => {
    expect(parseClientMessage("move.to", { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  it("returns null for an invalid payload", () => {
    expect(parseClientMessage("chat.send", { text: "" })).toBeNull();
    expect(parseClientMessage("move.to", null)).toBeNull();
  });
});
