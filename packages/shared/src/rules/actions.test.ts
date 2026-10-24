import { describe, expect, it } from "vitest";
import { GATHER_DURATION_MS, RESOURCE_NODES } from "../data/resources.ts";
import type { GameState } from "../game/state.ts";
import { applyAction } from "./actions.ts";

const tree = RESOURCE_NODES.heartland_tree;
const NOW = 60_000;

const state: GameState = {
  character: {
    id: "c1",
    name: "Alice",
    rank: "peasant",
    gold: 0,
    region: "heartland",
    x: tree.x + 1,
    y: tree.y,
    movedAt: 0,
    // East of the tree, facing it (west).
    facing: "w",
  },
  inventory: {},
  storage: {},
  job: null,
};

const gathering: GameState = {
  ...state,
  job: { kind: "gather", nodeId: "heartland_tree", startedAt: NOW, completesAt: NOW + 3_000 },
};

describe("applyAction", () => {
  it("applies move.to to the character", () => {
    expect(applyAction(state, { type: "move.to", payload: { x: 6, y: 7 } }, NOW)).toEqual({
      ok: true,
      value: {
        ...state,
        character: { ...state.character, x: 6, y: 7, movedAt: NOW, facing: "s" },
      },
    });
  });

  it("turns without moving", () => {
    const result = applyAction(state, { type: "turn", payload: { facing: "n" } }, NOW);
    expect(result.ok && result.value.character).toEqual({ ...state.character, facing: "n" });
  });

  it("cancels an unfinished gather when the character turns away", () => {
    const result = applyAction(gathering, { type: "turn", payload: { facing: "e" } }, NOW + 1_000);
    expect(result.ok && result.value.job).toBeNull();
  });

  it("keeps the gather going when turning to the way it already faces", () => {
    const result = applyAction(gathering, { type: "turn", payload: { facing: "w" } }, NOW + 1_000);
    expect(result.ok && result.value.job).toEqual(gathering.job);
  });

  it("keeps crafting when turning", () => {
    const crafting: GameState = {
      ...state,
      job: { kind: "craft", recipeId: "rake", startedAt: NOW, completesAt: NOW + 3_000 },
    };
    const result = applyAction(crafting, { type: "turn", payload: { facing: "e" } }, NOW + 1_000);
    expect(result.ok && result.value.job).toEqual(crafting.job);
  });

  it("applies gather.start", () => {
    const result = applyAction(
      state,
      { type: "gather.start", payload: { nodeId: "heartland_tree" } },
      NOW,
    );
    expect(result.ok && result.value.job).toEqual({
      kind: "gather",
      nodeId: "heartland_tree",
      startedAt: NOW,
      completesAt: NOW + GATHER_DURATION_MS,
    });
  });

  it("cancels an unfinished gather when the character walks away", () => {
    const result = applyAction(
      gathering,
      { type: "move.to", payload: { x: 12, y: 12 } },
      NOW + 1_000,
    );
    expect(result.ok && result.value.job).toBeNull();
    expect(result.ok && result.value.inventory).toEqual({});
  });

  it("keeps the gather going when the 'move' is to the same tile", () => {
    const here = { x: gathering.character.x, y: gathering.character.y };
    const result = applyAction(gathering, { type: "move.to", payload: here }, NOW + 1_000);
    expect(result.ok && result.value.job).toEqual(gathering.job);
  });

  it("collects a finished gather before handling the next action", () => {
    const result = applyAction(
      gathering,
      { type: "move.to", payload: { x: 12, y: 12 } },
      NOW + 5_000,
    );
    expect(result.ok && result.value.inventory).toEqual({ wood: 1 });
    expect(result.ok && result.value.job).toBeNull();
  });

  it("lets a new gather start once the last one has finished", () => {
    const result = applyAction(
      gathering,
      { type: "gather.start", payload: { nodeId: "heartland_tree" } },
      NOW + 3_000,
    );
    expect(result.ok && result.value.inventory).toEqual({ wood: 1 });
    expect(result.ok && result.value.job?.startedAt).toBe(NOW + 3_000);
  });

  it("passes rule failures through", () => {
    expect(applyAction(state, { type: "move.to", payload: { x: 9_999, y: 0 } }, NOW)).toEqual({
      ok: false,
      reason: "out_of_bounds",
    });
  });

  it("never mutates its input", () => {
    const frozen = structuredClone(gathering);
    applyAction(gathering, { type: "move.to", payload: { x: 1, y: 1 } }, NOW + 5_000);
    expect(gathering).toEqual(frozen);
  });
});
