import { describe, expect, it } from "vitest";
import {
  CARRY_LIMIT,
  STARTING_BUILDINGS,
  STARTING_STOREHOUSE,
  STOREHOUSE_LIMIT,
} from "../data/buildings.ts";
import { RESOURCE_NODES } from "../data/resources.ts";
import type { Direction } from "../game/direction.ts";
import type { GameState, Inventory } from "../game/state.ts";
import { applyAction } from "./actions.ts";
import { startCraft } from "./craft.ts";
import { startGather } from "./gather.ts";
import { atStorehouse, storeItems, takeItems } from "./storehouse.ts";

const store = STARTING_STOREHOUSE;
const tree = RESOURCE_NODES.heartland_tree;
// West of the storehouse's top-left tile, facing east into it.
const AT_DOOR = { x: store.x - 1, y: store.y, facing: "e" as Direction };

function state(
  where: { x: number; y: number; facing: Direction },
  inventory: Inventory = {},
  storage: Inventory = {},
): GameState {
  return {
    character: {
      id: "c1",
      name: "Alice",
      rank: "peasant",
      gold: 0,
      region: "heartland",
      homeRegion: "heartland",
      movedAt: 0,
      ...where,
    },
    inventory,
    storage: { [store.id]: storage },
    buildings: [...STARTING_BUILDINGS],
    fields: [],
    villagers: [],
    job: null,
  };
}

describe("atStorehouse", () => {
  it("is true beside the storehouse and facing it, from any side", () => {
    expect(atStorehouse(state(AT_DOOR))).toBe(true);
    expect(atStorehouse(state({ x: store.x, y: store.y - 1, facing: "s" }))).toBe(true);
    expect(atStorehouse(state({ x: store.x + 2, y: store.y + 1, facing: "w" }))).toBe(true);
    expect(atStorehouse(state({ x: store.x - 1, y: store.y - 1, facing: "se" }))).toBe(true);
  });

  it("is false when facing away, too far, or standing inside it", () => {
    expect(atStorehouse(state({ ...AT_DOOR, facing: "w" }))).toBe(false);
    expect(atStorehouse(state({ x: store.x - 2, y: store.y, facing: "e" }))).toBe(false);
    expect(atStorehouse(state({ x: store.x, y: store.y, facing: "e" }))).toBe(false);
  });
});

describe("storing", () => {
  it("moves items from hands into the storehouse", () => {
    expect(storeItems(state(AT_DOOR, { wood: 4 }), "wood", 3)).toEqual({
      ok: true,
      value: state(AT_DOOR, { wood: 1 }, { wood: 3 }),
    });
  });

  it("refuses away from the storehouse, without the items, or past 100", () => {
    const away = state({ ...AT_DOOR, facing: "w" }, { wood: 1 });
    expect(storeItems(away, "wood", 1)).toEqual({ ok: false, reason: "not_at_storehouse" });
    expect(storeItems(state(AT_DOOR, { wood: 1 }), "wood", 2)).toEqual({
      ok: false,
      reason: "not_enough_items",
    });
    const nearlyFull = state(AT_DOOR, { wood: 2 }, { wood: STOREHOUSE_LIMIT - 1 });
    expect(storeItems(nearlyFull, "wood", 2)).toEqual({ ok: false, reason: "storehouse_full" });
    expect(storeItems(nearlyFull, "wood", 1).ok).toBe(true);
  });
});

describe("more than one storehouse", () => {
  it("each keeps its own stock: storing fills the one the character faces", () => {
    const north = { ...store, id: "north_storehouse", x: 2, y: 1 };
    const s: GameState = {
      ...state({ x: north.x + 2, y: north.y, facing: "w" }, { wood: 3 }, { wood: 50 }),
      buildings: [...STARTING_BUILDINGS, north],
    };
    const stored = storeItems(s, "wood", 2);
    expect(stored.ok && stored.value.storage).toEqual({
      [store.id]: { wood: 50 },
      [north.id]: { wood: 2 },
    });
    expect(takeItems(s, "wood", 1)).toEqual({ ok: false, reason: "not_enough_items" });
  });
});

describe("taking", () => {
  it("moves items from the storehouse into hands", () => {
    expect(takeItems(state(AT_DOOR, {}, { stone: 10 }), "stone", 5)).toEqual({
      ok: true,
      value: state(AT_DOOR, { stone: 5 }, { stone: 5 }),
    });
  });

  it("refuses more than is stored, or more than hands can carry", () => {
    expect(takeItems(state(AT_DOOR, {}, { stone: 1 }), "stone", 2)).toEqual({
      ok: false,
      reason: "not_enough_items",
    });
    expect(takeItems(state(AT_DOOR, { stone: 4 }, { stone: 9 }), "stone", 2)).toEqual({
      ok: false,
      reason: "hands_full",
    });
  });

  it("works through applyAction", () => {
    const result = applyAction(
      state(AT_DOOR, {}, { wood: 3 }),
      { type: "storehouse.take", payload: { item: "wood", quantity: 3 } },
      0,
    );
    expect(result.ok && result.value.inventory).toEqual({ wood: 3 });
  });
});

describe("carry limit", () => {
  it("stops gathering when hands hold 5 of that item", () => {
    const full = state({ x: tree.x + 1, y: tree.y, facing: "w" }, { wood: CARRY_LIMIT });
    expect(startGather(full, "heartland_tree", 0)).toEqual({ ok: false, reason: "hands_full" });
    const room = state({ x: tree.x + 1, y: tree.y, facing: "w" }, { wood: CARRY_LIMIT - 1 });
    expect(startGather(room, "heartland_tree", 0).ok).toBe(true);
  });

  it("stops crafting when hands already hold 5 of the output", () => {
    const full = state(AT_DOOR, { wood: 2, stone: 1, rake: CARRY_LIMIT });
    expect(startCraft(full, "rake", 0)).toEqual({ ok: false, reason: "hands_full" });
  });
});
