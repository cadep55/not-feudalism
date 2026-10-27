import {
  covers,
  type GameState,
  houseDoor,
  newField,
  REGIONS,
  RESOURCE_NODES,
  STARTING_BUILDINGS,
  STARTING_HOUSE,
  STARTING_STOREHOUSE,
  taskTimeline,
  tileDistance,
  type VillagerTask,
  WANDER_RADIUS,
} from "@nf/shared";
import { describe, expect, it } from "vitest";
import { ALICE_STATE } from "../test-helpers.ts";
import { JOB_SETTLE_MS } from "./gathering.ts";
import {
  canWanderTo,
  MIN_VILLAGER_REFRESH_MS,
  nextVillagerRefresh,
  pickWanderTile,
  planStroll,
  strollPosition,
  villagerJob,
  villagerStatus,
  WANDER_PAUSE_MAX_MS,
  WANDER_PAUSE_MIN_MS,
  WANDER_TILES_PER_SECOND,
} from "./villagers.ts";

const REGION = REGIONS.heartland;
const BUILDINGS = [...STARTING_BUILDINGS];
const DOOR = houseDoor(STARTING_HOUSE);
const HOME = { door: DOOR, region: "heartland", buildings: BUILDINGS };
const ROUTE = { door: DOOR, storehouse: STARTING_STOREHOUSE, buildings: BUILDINGS };

/** A small seeded RNG (mulberry32) so the wander tests are repeatable. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WOOD: VillagerTask = {
  kind: "gather",
  nodeId: "heartland_tree",
  storehouseId: "heartland_storehouse",
  since: 0,
  delivered: 0,
};
const STONE: VillagerTask = {
  kind: "gather",
  nodeId: "heartland_rock",
  storehouseId: "heartland_storehouse",
  since: 0,
  delivered: 0,
};
const FIELD = newField("heartland", 13, 14, 0);
const WHEAT: VillagerTask = {
  kind: "harvest",
  fieldId: FIELD.id,
  storehouseId: "heartland_storehouse",
  since: 0,
  delivered: 0,
};

describe("villagerStatus and villagerJob", () => {
  it.each([
    [null, "idle", "Idle"],
    [WOOD, "wood", "Gathering wood"],
    [STONE, "stone", "Gathering stone"],
    [WHEAT, "wheat", "Harvesting wheat"],
  ] as const)("describes %o", (task, job, status) => {
    expect(villagerJob(task)).toBe(job);
    expect(villagerStatus(task)).toBe(status);
  });
});

describe("pickWanderTile", () => {
  it("stays within the wander radius of the door, on the map, off buildings and nodes", () => {
    const rng = seeded(42);
    const nodes = Object.values(RESOURCE_NODES);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const tile = pickWanderTile(rng, REGION, HOME);
      seen.add(`${tile.x},${tile.y}`);
      expect(tileDistance(tile, DOOR)).toBeLessThanOrEqual(WANDER_RADIUS);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(REGION.width);
      expect(tile.y).toBeLessThan(REGION.height);
      expect(BUILDINGS.some((b) => covers(b, tile))).toBe(false);
      expect(nodes.some((n) => n.x === tile.x && n.y === tile.y)).toBe(false);
    }
    // It really wanders: many different tiles get picked.
    expect(seen.size).toBeGreaterThan(10);
  });

  it("handles the edges of the RNG's range", () => {
    expect(
      tileDistance(
        pickWanderTile(() => 0, REGION, HOME),
        DOOR,
      ),
    ).toBeLessThanOrEqual(WANDER_RADIUS);
    expect(
      tileDistance(
        pickWanderTile(() => 0.999999, REGION, HOME),
        DOOR,
      ),
    ).toBeLessThanOrEqual(WANDER_RADIUS);
  });
});

describe("canWanderTo", () => {
  it("keeps idle villagers out of water", () => {
    expect(canWanderTo({ x: 21, y: 9 }, REGION, "east_coast", [])).toBe(false);
    expect(canWanderTo({ x: 20, y: 9 }, REGION, "east_coast", [])).toBe(true);
  });
});

describe("planStroll and strollPosition", () => {
  it("walks at the wander pace, then pauses 2-5 s", () => {
    const from = DOOR;
    const stroll = planStroll(from, 1_000, seeded(7), REGION, HOME);
    const distance = Math.max(Math.abs(stroll.to.x - from.x), Math.abs(stroll.to.y - from.y));
    expect(stroll.arriveAt - stroll.departAt).toBeCloseTo(
      (distance * 1000) / WANDER_TILES_PER_SECOND,
    );
    const pause = stroll.nextAt - stroll.arriveAt;
    expect(pause).toBeGreaterThanOrEqual(WANDER_PAUSE_MIN_MS);
    expect(pause).toBeLessThanOrEqual(WANDER_PAUSE_MAX_MS);
  });

  it("moves smoothly from start to destination and stays there", () => {
    const stroll = {
      from: { x: 0, y: 0 },
      to: { x: 4, y: 2 },
      departAt: 0,
      arriveAt: 1000,
      nextAt: 4000,
    };
    expect(strollPosition(stroll, -5)).toEqual({ x: 0, y: 0 });
    expect(strollPosition(stroll, 500)).toEqual({ x: 2, y: 1 });
    expect(strollPosition(stroll, 1000)).toEqual({ x: 4, y: 2 });
    expect(strollPosition(stroll, 3000)).toEqual({ x: 4, y: 2 });
  });

  it("stands still when already at the destination", () => {
    const stroll = {
      from: { x: 3, y: 3 },
      to: { x: 3, y: 3 },
      departAt: 0,
      arriveAt: 0,
      nextAt: 2000,
    };
    expect(strollPosition(stroll, 0)).toEqual({ x: 3, y: 3 });
  });
});

describe("nextVillagerRefresh", () => {
  const idle: GameState = {
    ...ALICE_STATE,
    villagers: [{ id: "v1", name: "Aldric", houseId: "heartland_house", task: null }],
  };

  it("doesn't refresh when no villager works", () => {
    expect(nextVillagerRefresh(ALICE_STATE, 0)).toBeNull();
    expect(nextVillagerRefresh(idle, 0)).toBeNull();
  });

  it("waits for the first delivery plus a settle margin", () => {
    const state: GameState = {
      ...idle,
      villagers: [{ id: "v1", name: "Aldric", houseId: "heartland_house", task: WOOD }],
    };
    const t = taskTimeline(WOOD, RESOURCE_NODES.heartland_tree, ROUTE);
    const firstAt = t.outbound + t.cycle - t.leg;
    expect(nextVillagerRefresh(state, 0)).toBe(firstAt + JOB_SETTLE_MS);
    expect(nextVillagerRefresh(state, 10_000)).toBe(firstAt + JOB_SETTLE_MS - 10_000);
  });

  it("after a delivery, waits for the next one", () => {
    const state: GameState = {
      ...idle,
      villagers: [{ id: "v1", name: "Aldric", houseId: "heartland_house", task: WOOD }],
    };
    const t = taskTimeline(WOOD, RESOURCE_NODES.heartland_tree, ROUTE);
    const firstAt = t.outbound + t.cycle - t.leg;
    const now = firstAt + JOB_SETTLE_MS;
    expect(nextVillagerRefresh(state, now)).toBe(firstAt + t.cycle + JOB_SETTLE_MS - now);
  });

  it("picks the soonest delivery across villagers", () => {
    const later = { ...STONE, since: 1_000_000 };
    const state: GameState = {
      ...idle,
      villagers: [
        { id: "v1", name: "Aldric", houseId: "heartland_house", task: later },
        { id: "v2", name: "Maud", houseId: "heartland_house", task: WOOD },
      ],
    };
    const t = taskTimeline(WOOD, RESOURCE_NODES.heartland_tree, ROUTE);
    expect(nextVillagerRefresh(state, 0)).toBe(t.outbound + t.cycle - t.leg + JOB_SETTLE_MS);
  });

  it("never polls faster than the minimum", () => {
    const state: GameState = {
      ...idle,
      villagers: [{ id: "v1", name: "Aldric", houseId: "heartland_house", task: WOOD }],
    };
    const t = taskTimeline(WOOD, RESOURCE_NODES.heartland_tree, ROUTE);
    const firstAt = t.outbound + t.cycle - t.leg;
    expect(nextVillagerRefresh(state, firstAt - 10)).toBe(MIN_VILLAGER_REFRESH_MS);
  });

  it("ignores a harvest whose field is gone, and counts one whose field is there", () => {
    const gone: GameState = {
      ...idle,
      villagers: [{ id: "v1", name: "Aldric", houseId: "heartland_house", task: WHEAT }],
    };
    expect(nextVillagerRefresh(gone, 0)).toBeNull();
    const there: GameState = { ...gone, fields: [FIELD] };
    expect(nextVillagerRefresh(there, 0)).not.toBeNull();
  });
});
