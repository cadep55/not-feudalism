import { describe, expect, it } from "vitest";
import { ActionRequest } from "./actions.ts";

const requestId = "7d9f3a2e-4b1c-4e8a-9f6d-2c5b8a1e0f34";

describe("ActionRequest", () => {
  it("accepts a known action with a UUID requestId", () => {
    expect(ActionRequest.parse({ requestId, type: "move.to", payload: { x: 1, y: 2 } })).toEqual({
      requestId,
      type: "move.to",
      payload: { x: 1, y: 2 },
    });
  });

  it.each([
    ["unknown action type", { requestId, type: "gold.grant", payload: { amount: 1000 } }],
    ["bad payload", { requestId, type: "move.to", payload: { x: -1, y: 2 } }],
    ["missing requestId", { type: "move.to", payload: { x: 1, y: 2 } }],
    ["non-UUID requestId", { requestId: "1", type: "move.to", payload: { x: 1, y: 2 } }],
    ["extra fields", { requestId, type: "move.to", payload: { x: 1, y: 2 }, result: "win" }],
  ])("rejects %s", (_label, body) => {
    expect(ActionRequest.safeParse(body).success).toBe(false);
  });
});
