import { describe, expect, it } from "vitest";
import type { GameState } from "../game/state.ts";
import { applyAction } from "./actions.ts";

const state: GameState = {
  character: {
    id: "c1",
    name: "Alice",
    rank: "peasant",
    gold: 0,
    region: "heartland",
    x: 5,
    y: 5,
    movedAt: 0,
  },
};
const NOW = 60_000;

describe("applyAction", () => {
  it("applies move.to to the character", () => {
    expect(applyAction(state, { type: "move.to", payload: { x: 6, y: 7 } }, NOW)).toEqual({
      ok: true,
      value: { character: { ...state.character, x: 6, y: 7, movedAt: NOW } },
    });
  });

  it("passes rule failures through without changing the state", () => {
    expect(applyAction(state, { type: "move.to", payload: { x: 9_999, y: 0 } }, NOW)).toEqual({
      ok: false,
      reason: "out_of_bounds",
    });
  });

  it("never mutates its input", () => {
    const frozen = structuredClone(state);
    applyAction(state, { type: "move.to", payload: { x: 1, y: 1 } }, NOW);
    expect(state).toEqual(frozen);
  });
});
