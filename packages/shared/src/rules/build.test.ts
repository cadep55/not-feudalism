import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BUILD_COSTS,
  BUILD_DURATION_MS,
  BUILDING_LIMITS,
  type Building,
  CARRY_LIMIT,
  REMOVE_DURATION_MS,
  STARTING_BUILDINGS,
  STARTING_HOUSE,
  STARTING_STOREHOUSE,
  STOREHOUSE_LIMIT,
} from "../data/buildings.ts";
import { ITEM_IDS } from "../data/items.ts";
import { RESOURCE_NODES } from "../data/resources.ts";
import { VILLAGERS_PER_HOUSE } from "../data/villagers.ts";
import type { GameState, Inventory, Villager, VillagerTask } from "../game/state.ts";
import { applyAction, settleWorld } from "./actions.ts";
import { completeBuild, placementBlocked, startBuild, startRemove } from "./build.ts";
import { newField } from "./farming.ts";

const NOW = 1_000_000;
const store = STARTING_STOREHOUSE; // (15, 8)
const house = STARTING_HOUSE; // (5, 12)
/** Open grass with room for a 2x2 building and its clear ring. */
const OPEN = { x: 20, y: 13 };
const FIELD = newField("heartland", 13, 14, 0);

function villager(id: string, task: VillagerTask | null = null, houseId = house.id): Villager {
  return { id, name: `Name ${id}`, houseId, task };
}

function state(overrides: Partial<GameState> = {}, inventory: Inventory = {}): GameState {
  return {
    character: {
      id: "c1",
      name: "Alice",
      rank: "peasant",
      gold: 0,
      region: "heartland",
      x: 10,
      y: 10,
      movedAt: 0,
      facing: "s",
    },
    inventory,
    buildings: [...STARTING_BUILDINGS],
    storage: { [store.id]: {} },
    fields: [FIELD],
    villagers: [villager("v1"), villager("v2"), villager("v3")],
    job: null,
    ...overrides,
  };
}

/** A second storehouse (and its stock) next to the open spot. */
const EAST: Building = { ...store, id: "east_storehouse", x: 20, y: 4 };
/** A second house. */
const WEST: Building = { ...house, id: "west_house", x: 2, y: 2 };

describe("costs and limits", () => {
  it("uses the owner's numbers", () => {
    expect(BUILD_COSTS).toEqual({ house: { wood: 5 }, storehouse: { wood: 5, stone: 5 } });
    expect(BUILD_DURATION_MS).toBe(10_000);
    expect(REMOVE_DURATION_MS).toBe(5_000);
    expect(BUILDING_LIMITS).toEqual({ house: 5, storehouse: 3 });
  });
});

describe("placement", () => {
  it("allows open grass with a clear tile on every side", () => {
    expect(placementBlocked(state(), "house", OPEN.x, OPEN.y)).toBeNull();
  });

  it("refuses off the map, or against its edge", () => {
    expect(placementBlocked(state(), "house", 24, 5)).toBe("out_of_bounds");
    expect(placementBlocked(state(), "house", 5, 17)).toBe("out_of_bounds");
    expect(placementBlocked(state(), "house", 0, 5)).toBe("cannot_build_here");
    expect(placementBlocked(state(), "house", 23, 5)).toBe("cannot_build_here");
    expect(placementBlocked(state(), "house", 5, 16)).toBe("cannot_build_here");
  });

  it("needs its footprint and the ring around it free of buildings, nodes and fields", () => {
    // Right beside the storehouse (15, 8): the ring touches it.
    expect(placementBlocked(state(), "house", 17, 8)).toBe("cannot_build_here");
    expect(placementBlocked(state(), "house", 18, 8)).toBeNull();
    // The tree at (5, 5) sits in the ring of a building at (6, 6).
    const tree = RESOURCE_NODES.heartland_tree;
    expect(placementBlocked(state(), "house", tree.x + 1, tree.y + 1)).toBe("cannot_build_here");
    // The field at (13, 14) sits in the ring of a building at (11, 12).
    expect(placementBlocked(state(), "house", 11, 12)).toBe("cannot_build_here");
  });

  it("refuses where the character stands", () => {
    const standing = state({ character: { ...state().character, x: OPEN.x + 1, y: OPEN.y } });
    expect(placementBlocked(standing, "house", OPEN.x, OPEN.y)).toBe("cannot_build_here");
  });

  it("refuses in a region that doesn't exist", () => {
    const lost = state({ character: { ...state().character, region: "nowhere" } });
    expect(placementBlocked(lost, "house", OPEN.x, OPEN.y)).toBe("cannot_build_here");
  });
});

describe("building", () => {
  it("pays from the inventory now, and the building appears after 10 seconds", () => {
    const started = startBuild(state({}, { wood: 5, stone: 5 }), "storehouse", OPEN.x, OPEN.y, NOW);
    if (!started.ok) throw new Error(started.reason);
    expect(started.value.inventory).toEqual({});
    expect(started.value.job).toMatchObject({
      kind: "build",
      startedAt: NOW,
      completesAt: NOW + BUILD_DURATION_MS,
      building: { kind: "storehouse", x: OPEN.x, y: OPEN.y, width: 2, height: 2 },
    });
    expect(started.value.buildings).toHaveLength(2);

    const done = settleWorld(started.value, NOW + BUILD_DURATION_MS);
    expect(done.job).toBeNull();
    expect(done.buildings).toHaveLength(3);
    const built = done.buildings[2];
    if (!built) throw new Error("not built");
    expect(done.storage[built.id]).toEqual({});
  });

  it("a new house brings 3 villagers with new ids and names", () => {
    const built = completeBuild(state(), { ...WEST });
    const newcomers = built.villagers.slice(3);
    expect(newcomers).toHaveLength(VILLAGERS_PER_HOUSE);
    expect(newcomers.map((v) => v.id)).toEqual(["v4", "v5", "v6"]);
    for (const v of newcomers) {
      expect(v).toMatchObject({ houseId: WEST.id, task: null });
      expect(state().villagers.map((old) => old.name)).not.toContain(v.name);
    }
    expect(new Set(newcomers.map((v) => v.name)).size).toBe(VILLAGERS_PER_HOUSE);
  });

  it("refuses while busy, at the limit, without materials, or in a bad spot", () => {
    const rich = { wood: 5, stone: 5 };
    const busy = state(
      { job: { kind: "craft", recipeId: "rake", startedAt: 0, completesAt: NOW } },
      rich,
    );
    expect(startBuild(busy, "house", OPEN.x, OPEN.y, NOW)).toEqual({ ok: false, reason: "busy" });
    const full = state(
      { buildings: [...STARTING_BUILDINGS, EAST, { ...EAST, id: "third" }] },
      rich,
    );
    expect(startBuild(full, "storehouse", OPEN.x, OPEN.y, NOW)).toEqual({
      ok: false,
      reason: "building_limit",
    });
    expect(startBuild(state({}, { wood: 4 }), "house", OPEN.x, OPEN.y, NOW)).toEqual({
      ok: false,
      reason: "missing_materials",
    });
    expect(startBuild(state({}, { wood: 5 }), "storehouse", OPEN.x, OPEN.y, NOW)).toEqual({
      ok: false,
      reason: "missing_materials",
    });
    expect(startBuild(state({}, rich), "house", 17, 8, NOW)).toEqual({
      ok: false,
      reason: "cannot_build_here",
    });
  });

  it("works through applyAction", () => {
    const result = applyAction(
      state({}, { wood: 5 }),
      { type: "building.build", payload: { kind: "house", ...OPEN } },
      NOW,
    );
    expect(result.ok && result.value.job?.kind).toBe("build");
  });
});

describe("removing", () => {
  const twoStorehouses = () =>
    state({ buildings: [...STARTING_BUILDINGS, EAST], storage: { [store.id]: {}, [EAST.id]: {} } });

  it("takes the building down now, refunds into the inventory, and keeps the character busy 5 seconds", () => {
    const removed = startRemove(twoStorehouses(), EAST.id, NOW);
    if (!removed.ok) throw new Error(removed.reason);
    expect(removed.value.buildings.map((b) => b.id)).not.toContain(EAST.id);
    expect(removed.value.storage).toEqual({ [store.id]: {} });
    expect(removed.value.inventory).toEqual({ wood: 5, stone: 5 });
    expect(removed.value.job).toMatchObject({
      kind: "remove",
      building: EAST,
      completesAt: NOW + REMOVE_DURATION_MS,
    });
    expect(settleWorld(removed.value, NOW + REMOVE_DURATION_MS).job).toBeNull();
  });

  it("puts what the inventory can't hold in the nearest storehouse, or refuses if it won't fit", () => {
    const s = { ...twoStorehouses(), inventory: { wood: 3 } };
    const removed = startRemove(s, EAST.id, NOW);
    expect(removed.ok && removed.value.inventory).toEqual({ wood: 5, stone: 5 });
    expect(removed.ok && removed.value.storage[store.id]).toEqual({ wood: 3 });

    const full = { ...s, storage: { [store.id]: { wood: STOREHOUSE_LIMIT - 2 }, [EAST.id]: {} } };
    expect(startRemove(full, EAST.id, NOW)).toEqual({ ok: false, reason: "no_room_for_refund" });
  });

  it("refuses the last house or storehouse, a storehouse that isn't empty, or while busy", () => {
    expect(startRemove(state(), house.id, NOW)).toEqual({ ok: false, reason: "last_building" });
    expect(startRemove(state(), store.id, NOW)).toEqual({ ok: false, reason: "last_building" });
    const stocked = { ...twoStorehouses(), storage: { [store.id]: {}, [EAST.id]: { rake: 1 } } };
    expect(startRemove(stocked, EAST.id, NOW)).toEqual({
      ok: false,
      reason: "storehouse_not_empty",
    });
    expect(startRemove(state(), "nope", NOW)).toEqual({ ok: false, reason: "no_building" });
    const busy = {
      ...twoStorehouses(),
      job: {
        kind: "craft" as const,
        recipeId: "rake" as const,
        startedAt: 0,
        completesAt: NOW + 1,
      },
    };
    expect(startRemove(busy, EAST.id, NOW)).toEqual({ ok: false, reason: "busy" });
  });

  it("a removed house's villagers stop, return their rakes and leave", () => {
    const farming: VillagerTask = {
      kind: "harvest",
      fieldId: FIELD.id,
      storehouseId: store.id,
      since: NOW,
      delivered: 0,
    };
    const s = state({
      buildings: [...STARTING_BUILDINGS, WEST],
      villagers: [villager("v1"), villager("v4", farming, WEST.id), villager("v5", null, WEST.id)],
    });
    const removed = startRemove(s, WEST.id, NOW + 1);
    expect(removed.ok && removed.value.villagers.map((v) => v.id)).toEqual(["v1"]);
    expect(removed.ok && removed.value.storage[store.id]).toEqual({ rake: 1 });
    expect(removed.ok && removed.value.inventory).toEqual({ wood: 5 });
  });

  it("villagers who delivered to a removed storehouse start over with the nearest one left", () => {
    const wood: VillagerTask = {
      kind: "gather",
      nodeId: "heartland_tree",
      storehouseId: EAST.id,
      since: NOW - 60_000,
      delivered: 0,
    };
    const s = { ...twoStorehouses(), villagers: [villager("v1", wood)] };
    const removed = startRemove(s, EAST.id, NOW);
    expect(removed.ok && removed.value.villagers[0]?.task).toEqual({
      ...wood,
      storehouseId: store.id,
      since: NOW,
      delivered: 0,
    });
  });

  it("a villager whose path changes because tiles were freed starts its trip over", () => {
    // A house right above the field at (13, 14) blocks two of its work spots.
    const above: Building = { ...house, id: "above_house", x: 12, y: 12 };
    const harvest: VillagerTask = {
      kind: "harvest",
      fieldId: FIELD.id,
      storehouseId: store.id,
      since: NOW - 60_000,
      delivered: 0,
    };
    const wood: VillagerTask = { ...harvest, kind: "gather", nodeId: "heartland_tree" };
    const s = state({
      buildings: [...STARTING_BUILDINGS, above],
      villagers: [villager("v1", harvest), villager("v2", wood)],
    });
    const removed = startRemove(s, above.id, NOW);
    expect(removed.ok && removed.value.villagers[0]?.task).toMatchObject({
      since: NOW,
      delivered: 0,
    });
    // The tree's path didn't change, so that villager carries on.
    expect(removed.ok && removed.value.villagers[1]?.task).toEqual(wood);
  });

  it("works through applyAction", () => {
    const result = applyAction(
      { ...state({ buildings: [...STARTING_BUILDINGS, WEST] }) },
      { type: "building.remove", payload: { buildingId: WEST.id } },
      NOW,
    );
    expect(result.ok && result.value.job?.kind).toBe("remove");
  });
});

describe("conservation", () => {
  const total = (s: GameState) => {
    const sum: Record<string, number> = {};
    for (const inv of [s.inventory, ...Object.values(s.storage)]) {
      for (const id of ITEM_IDS) sum[id] = (sum[id] ?? 0) + (inv[id] ?? 0);
    }
    return sum;
  };

  it("building then removing gives back exactly what it cost", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("house" as const, "storehouse" as const),
        fc.integer({ min: 5, max: CARRY_LIMIT }),
        fc.integer({ min: 5, max: CARRY_LIMIT }),
        (kind, wood, stone) => {
          const before = state({}, { wood, stone });
          const started = startBuild(before, kind, OPEN.x, OPEN.y, NOW);
          if (!started.ok) return false;
          const built = settleWorld(started.value, NOW + BUILD_DURATION_MS);
          const id = built.buildings[2]?.id;
          if (!id) return false;
          const removed = startRemove(built, id, NOW + BUILD_DURATION_MS);
          if (!removed.ok) return false;
          return JSON.stringify(total(removed.value)) === JSON.stringify(total(before));
        },
      ),
    );
  });
});
