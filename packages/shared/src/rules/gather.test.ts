import { describe, expect, it } from "vitest";
import { STARTING_BUILDINGS } from "../data/buildings.ts";
import { GATHER_DURATION_MS, GATHER_YIELD, RESOURCE_NODES } from "../data/resources.ts";
import { directionBetween } from "../game/direction.ts";
import type { GameState } from "../game/state.ts";
import { startGather } from "./gather.ts";
import { addItems } from "./inventory.ts";
import { resolveJob } from "./jobs.ts";

const tree = RESOURCE_NODES.heartland_tree;
const NOW = 1_000_000;

/**
 * A character at `position`. Unless told otherwise it faces `toward`
 * (default: the tree), as the client turns before gathering.
 */
function stateAt(
  position: { x: number; y: number },
  overrides: Partial<GameState> = {},
  toward: { x: number; y: number } = tree,
): GameState {
  return {
    character: {
      id: "c1",
      name: "Alice",
      rank: "peasant",
      gold: 0,
      region: "heartland",
      homeRegion: "heartland",
      ...position,
      movedAt: 0,
      facing: directionBetween(position, toward) ?? "s",
    },
    inventory: {},
    storage: {},
    buildings: [...STARTING_BUILDINGS],
    fields: [],
    villagers: [],
    job: null,
    others: [],
    ...overrides,
  };
}

describe("startGather", () => {
  it("starts a timed job when standing next to the node and facing it, diagonals included", () => {
    for (const spot of [
      { x: tree.x + 1, y: tree.y },
      { x: tree.x - 1, y: tree.y - 1 },
      { x: tree.x, y: tree.y + 1 },
    ]) {
      expect(startGather(stateAt(spot), "heartland_tree", NOW)).toEqual({
        ok: true,
        value: stateAt(spot, {
          job: {
            kind: "gather",
            nodeId: "heartland_tree",
            startedAt: NOW,
            completesAt: NOW + GATHER_DURATION_MS,
          },
        }),
      });
    }
  });

  it("refuses when next to the node but facing away", () => {
    const beside = { x: tree.x + 1, y: tree.y };
    const facingAway = stateAt(beside, {}, { x: tree.x + 2, y: tree.y });
    expect(startGather(facingAway, "heartland_tree", NOW)).toEqual({
      ok: false,
      reason: "not_facing",
    });
  });

  it("refuses when standing on the node itself (nothing to face)", () => {
    const onTop = stateAt({ x: tree.x, y: tree.y }, {}, { x: tree.x, y: tree.y + 1 });
    expect(startGather(onTop, "heartland_tree", NOW)).toEqual({ ok: false, reason: "not_facing" });
  });

  it("refuses when the character is more than one tile away", () => {
    expect(startGather(stateAt({ x: tree.x + 2, y: tree.y }), "heartland_tree", NOW)).toEqual({
      ok: false,
      reason: "too_far_away",
    });
  });

  it("refuses a second job while one is running", () => {
    const busy = startGather(stateAt({ x: tree.x, y: tree.y + 1 }), "heartland_tree", NOW);
    if (!busy.ok) throw new Error("setup failed");
    expect(startGather(busy.value, "heartland_tree", NOW + 1)).toEqual({
      ok: false,
      reason: "busy",
    });
  });
});

describe("resolveJob", () => {
  const gathering = stateAt(
    { x: tree.x + 1, y: tree.y },
    {
      inventory: { wood: 2 },
      job: { kind: "gather", nodeId: "heartland_tree", startedAt: NOW, completesAt: NOW + 3_000 },
    },
  );

  it("does nothing before the job's time", () => {
    expect(resolveJob(gathering, NOW + 2_999)).toBe(gathering);
  });

  it("adds the node's yield and clears the job when time is up, even long after", () => {
    for (const later of [NOW + 3_000, NOW + 86_400_000]) {
      expect(resolveJob(gathering, later)).toEqual({
        ...gathering,
        inventory: { wood: 2 + GATHER_YIELD },
        job: null,
      });
    }
  });

  it("leaves an idle state alone", () => {
    const idle = stateAt({ x: 0, y: 0 });
    expect(resolveJob(idle, NOW)).toBe(idle);
  });
});

describe("addItems", () => {
  it("adds to an existing count or starts one", () => {
    expect(addItems({ wood: 1 }, "wood", 2)).toEqual({ wood: 3 });
    expect(addItems({ wood: 1 }, "stone", 1)).toEqual({ wood: 1, stone: 1 });
  });
});
