import { describe, expect, it } from "vitest";
import {
  type Building,
  covers,
  STARTING_BUILDINGS,
  STARTING_HOUSE,
  STARTING_STOREHOUSE,
  STOREHOUSE_LIMIT,
} from "../data/buildings.ts";
import { RESOURCE_NODES } from "../data/resources.ts";
import {
  VILLAGER_GATHER_MS,
  VILLAGER_LOAD,
  VILLAGER_NAMES,
  VILLAGERS_PER_HOUSE,
} from "../data/villagers.ts";
import type { GameState, Inventory, Villager, VillagerTask } from "../game/state.ts";
import { applyAction } from "./actions.ts";
import { houseDoor } from "./buildings.ts";
import { newField } from "./farming.ts";
import { tileDistance } from "./move.ts";
import {
  assignVillager,
  deliveriesBy,
  dropOffSpot,
  pickVillagerNames,
  type Route,
  settleVillagers,
  taskTimeline,
  villagerActivity,
  villagerRoute,
  workSpot,
} from "./villagers.ts";

const T0 = 1_000_000;
const tree = RESOURCE_NODES.heartland_tree;
const store = STARTING_STOREHOUSE;
const house = STARTING_HOUSE;
/** Every starting villager walks out of the starting house to the starting storehouse. */
const ROUTE: Route = {
  door: houseDoor(house),
  storehouse: store,
  buildings: [...STARTING_BUILDINGS],
};
const FIELD = newField("heartland", 13, 14, 0);

function villager(task: VillagerTask | null = null, id = "v1"): Villager {
  return { id, name: "Aldric", houseId: house.id, task };
}

function state(
  villagers: Villager[],
  storage: Inventory = {},
  fields = [FIELD],
  extra: { buildings?: Building[]; storage?: GameState["storage"] } = {},
): GameState {
  return {
    character: {
      id: "c1",
      name: "Alice",
      rank: "peasant",
      gold: 0,
      region: "heartland",
      homeRegion: "heartland",
      x: 10,
      y: 10,
      movedAt: 0,
      facing: "s",
    },
    inventory: {},
    storage: { [store.id]: storage, ...extra.storage },
    buildings: extra.buildings ?? [...STARTING_BUILDINGS],
    fields,
    villagers,
    job: null,
  };
}

const gatherWood: VillagerTask = {
  kind: "gather",
  nodeId: "heartland_tree",
  storehouseId: store.id,
  since: T0,
  delivered: 0,
};

/** When delivery `k` of a task lands (docs/design/villagers.md). */
function deliveryTime(task: VillagerTask, target: { x: number; y: number }, k: number): number {
  const t = taskTimeline(task, target, ROUTE);
  return t.since + t.outbound + k * t.cycle - t.leg;
}

describe("names", () => {
  it("picks 3 different names from the list, the same for the same seed", () => {
    const names = pickVillagerNames("character-123");
    expect(names).toHaveLength(VILLAGERS_PER_HOUSE);
    expect(new Set(names).size).toBe(VILLAGERS_PER_HOUSE);
    for (const name of names) expect(VILLAGER_NAMES).toContain(name);
    expect(pickVillagerNames("character-123")).toEqual(names);
  });
});

describe("places", () => {
  it("sets out from just below the house", () => {
    expect(houseDoor(house)).toEqual({ x: house.x, y: house.y + house.height });
    expect(villagerRoute([...STARTING_BUILDINGS], villager(gatherWood))).toEqual(ROUTE);
    expect(villagerRoute([...STARTING_BUILDINGS], villager(null))).toBeNull();
    expect(villagerRoute([house], villager(gatherWood))).toBeNull();
  });

  it("works from a free tile beside the target, and drops off beside the storehouse", () => {
    const work = workSpot(tree, ROUTE);
    expect(tileDistance(work, tree)).toBe(1);
    const drop = dropOffSpot(work, ROUTE);
    expect(covers(store, drop)).toBe(false);
    expect([store.x - 1, store.x, store.x + 1, store.x + 2]).toContain(drop.x);
    expect([store.y - 1, store.y, store.y + 1, store.y + 2]).toContain(drop.y);
  });
});

describe("the work timeline", () => {
  it("delivers 5 units per cycle, each unit taking 9 seconds", () => {
    const t = taskTimeline(gatherWood, tree, ROUTE);
    expect(t.load).toBe(VILLAGER_LOAD * VILLAGER_GATHER_MS);
    expect(VILLAGER_GATHER_MS).toBe(9_000);
    expect(t.cycle).toBe(t.load + 2 * t.leg);
  });

  it("counts deliveries exactly at their times", () => {
    const first = deliveryTime(gatherWood, tree, 1);
    expect(deliveriesBy(gatherWood, tree, ROUTE, first - 1)).toBe(0);
    expect(deliveriesBy(gatherWood, tree, ROUTE, first)).toBe(1);
    expect(deliveriesBy(gatherWood, tree, ROUTE, deliveryTime(gatherWood, tree, 3))).toBe(3);
    expect(deliveriesBy(gatherWood, tree, ROUTE, T0 - 5_000)).toBe(0);
  });

  it("walks out, gathers at the work spot, and walks the drop-off leg", () => {
    const t = taskTimeline(gatherWood, tree, ROUTE);
    const start = villagerActivity(gatherWood, tree, ROUTE, T0);
    expect(start).toMatchObject({ activity: "walking", ...houseDoor(house) });
    expect(villagerActivity(gatherWood, tree, ROUTE, T0 + t.outbound + 1)).toEqual({
      activity: "gathering",
      ...t.work,
    });
    const delivering = villagerActivity(gatherWood, tree, ROUTE, deliveryTime(gatherWood, tree, 1));
    expect(delivering).toMatchObject({ activity: "walking", ...t.drop });
    // Halfway along the walk to the storehouse.
    const halfway = villagerActivity(gatherWood, tree, ROUTE, T0 + t.outbound + t.load + t.leg / 2);
    expect(halfway.activity).toBe("walking");
    expect(halfway.x).toBeCloseTo((t.work.x + t.drop.x) / 2);
    expect(halfway.y).toBeCloseTo((t.work.y + t.drop.y) / 2);
  });
});

describe("settling", () => {
  it("puts finished deliveries in the storehouse and remembers them", () => {
    const s = state([villager(gatherWood)]);
    const after = settleVillagers(s, deliveryTime(gatherWood, tree, 2));
    expect(after.storage[store.id]).toEqual({ wood: 2 * VILLAGER_LOAD });
    expect(after.villagers[0]?.task).toMatchObject({ delivered: 2 });
    // Settling again at the same time adds nothing.
    expect(settleVillagers(after, deliveryTime(gatherWood, tree, 2))).toBe(after);
  });

  it("stops a villager whose delivery doesn't fit, handing in what does", () => {
    const s = state([villager(gatherWood)], { wood: STOREHOUSE_LIMIT - 2 });
    const after = settleVillagers(s, deliveryTime(gatherWood, tree, 1));
    expect(after.storage[store.id]).toEqual({ wood: STOREHOUSE_LIMIT });
    expect(after.villagers[0]?.task).toBeNull();
  });

  it("harvests wheat by the field rules, and gives the rake back when the field runs out", () => {
    const harvest: VillagerTask = {
      kind: "harvest",
      fieldId: FIELD.id,
      storehouseId: store.id,
      since: T0,
      delivered: 0,
    };
    const almostEmpty = { ...FIELD, wheat: 3, seeds: 1, harvests: 47 };
    const s = state([villager(harvest)], {}, [almostEmpty]);
    const after = settleVillagers(s, deliveryTime(harvest, FIELD, 1));
    expect(after.fields).toEqual([]);
    expect(after.storage[store.id]).toEqual({ wheat: 3, wheat_seeds: 1, rake: 1 });
    expect(after.villagers[0]?.task).toBeNull();
  });

  it("keeps harvesting a field with plenty left, delivering 5 wheat a trip", () => {
    const harvest: VillagerTask = {
      kind: "harvest",
      fieldId: FIELD.id,
      storehouseId: store.id,
      since: T0,
      delivered: 0,
    };
    const after = settleVillagers(state([villager(harvest)]), deliveryTime(harvest, FIELD, 1));
    expect(after.storage[store.id]).toEqual({ wheat: VILLAGER_LOAD });
    expect(after.fields[0]).toMatchObject({ wheat: FIELD.wheat - VILLAGER_LOAD });
    expect(after.villagers[0]?.task).toMatchObject({ delivered: 1 });
  });

  it("stops a farming villager when the storehouse is full of wheat, returning its rake", () => {
    const harvest: VillagerTask = {
      kind: "harvest",
      fieldId: FIELD.id,
      storehouseId: store.id,
      since: T0,
      delivered: 0,
    };
    const s = state([villager(harvest)], { wheat: STOREHOUSE_LIMIT - 1 });
    const after = settleVillagers(s, deliveryTime(harvest, FIELD, 1));
    expect(after.storage[store.id]).toEqual({ wheat: STOREHOUSE_LIMIT, rake: 1 });
    expect(after.villagers[0]?.task).toBeNull();
  });

  it("idles a villager whose field is already gone", () => {
    const harvest: VillagerTask = {
      kind: "harvest",
      fieldId: "heartland:1,1",
      storehouseId: store.id,
      since: T0,
      delivered: 0,
    };
    const after = settleVillagers(state([villager(harvest)]), T0 + 60_000);
    expect(after.villagers[0]?.task).toBeNull();
    expect(after.storage[store.id]).toEqual({ rake: 1 });
  });

  it("puts what doesn't fit into the next nearest storehouse, then stops when all are full", () => {
    // A second storehouse far off in the bottom-right corner.
    const far: Building = { ...store, id: "far_storehouse", x: 22, y: 15 };
    const buildings = [...STARTING_BUILDINGS, far];
    const s = state([villager(gatherWood)], { wood: STOREHOUSE_LIMIT - 2 }, [FIELD], {
      buildings,
      storage: { [far.id]: { wood: STOREHOUSE_LIMIT - 1 } },
    });
    const after = settleVillagers(s, deliveryTime(gatherWood, tree, 1));
    // 2 fit at its own storehouse, 1 at the far one, and 2 fit nowhere: it stops.
    expect(after.storage).toEqual({
      [store.id]: { wood: STOREHOUSE_LIMIT },
      [far.id]: { wood: STOREHOUSE_LIMIT },
    });
    expect(after.villagers[0]?.task).toBeNull();

    const roomy = state([villager(gatherWood)], { wood: STOREHOUSE_LIMIT - 2 }, [FIELD], {
      buildings,
    });
    const kept = settleVillagers(roomy, deliveryTime(gatherWood, tree, 1));
    expect(kept.storage[far.id]).toEqual({ wood: 3 });
    expect(kept.villagers[0]?.task).toMatchObject({ delivered: 1 });
  });

  it("idles a villager whose house or storehouse is gone, returning a rake to a storehouse", () => {
    const harvest: VillagerTask = {
      kind: "harvest",
      fieldId: FIELD.id,
      storehouseId: "gone",
      since: T0,
      delivered: 0,
    };
    const after = settleVillagers(state([villager(harvest)]), T0 + 60_000);
    expect(after.villagers[0]?.task).toBeNull();
    expect(after.storage[store.id]).toEqual({ rake: 1 });
    const homeless = { ...villager(gatherWood), houseId: "gone" };
    expect(settleVillagers(state([homeless]), T0 + 60_000).villagers[0]?.task).toBeNull();
  });

  it("leaves idle villagers and future deliveries alone", () => {
    const s = state([villager(null), villager(gatherWood, "v2")]);
    expect(settleVillagers(s, T0 + 1)).toBe(s);
  });
});

describe("assigning", () => {
  it("sends a villager to gather wood or stone from now", () => {
    const result = assignVillager(state([villager()]), "v1", "stone", T0);
    expect(result.ok && result.value.villagers[0]?.task).toEqual({
      kind: "gather",
      nodeId: "heartland_rock",
      storehouseId: store.id,
      since: T0,
      delivered: 0,
    });
  });

  it("farming takes a rake from the storehouse; going idle puts it back", () => {
    const farming = assignVillager(state([villager()], { rake: 1 }), "v1", "wheat", T0);
    expect(farming.ok && farming.value.storage[store.id]).toEqual({});
    expect(farming.ok && farming.value.villagers[0]?.task).toMatchObject({
      kind: "harvest",
      fieldId: FIELD.id,
    });
    if (!farming.ok) throw new Error("setup failed");
    const idle = assignVillager(farming.value, "v1", "idle", T0 + 1);
    expect(idle.ok && idle.value.storage[store.id]).toEqual({ rake: 1 });
    expect(idle.ok && idle.value.villagers[0]?.task).toBeNull();
  });

  it("refuses farming without a rake in the storehouse, or with no grown field", () => {
    expect(assignVillager(state([villager()]), "v1", "wheat", T0)).toEqual({
      ok: false,
      reason: "no_rake_in_storehouse",
    });
    const growing = [{ ...FIELD, readyAt: T0 + 1 }];
    expect(assignVillager(state([villager()], { rake: 1 }, growing), "v1", "wheat", T0)).toEqual({
      ok: false,
      reason: "no_field",
    });
  });

  it("delivers to the storehouse nearest the work, and takes a rake from one that has it", () => {
    // A second storehouse near the tree; the field stays nearest the starting one.
    const north: Building = { ...store, id: "north_storehouse", x: 2, y: 1 };
    const extra = {
      buildings: [...STARTING_BUILDINGS, north],
      storage: { [north.id]: { rake: 1 } },
    };
    const wood = assignVillager(state([villager()], {}, [FIELD], extra), "v1", "wood", T0);
    expect(wood.ok && wood.value.villagers[0]?.task).toMatchObject({ storehouseId: north.id });
    const stone = assignVillager(state([villager()], {}, [FIELD], extra), "v1", "stone", T0);
    expect(stone.ok && stone.value.villagers[0]?.task).toMatchObject({ storehouseId: store.id });

    const farming = assignVillager(state([villager()], {}, [FIELD], extra), "v1", "wheat", T0);
    expect(farming.ok && farming.value.villagers[0]?.task).toMatchObject({
      fieldId: FIELD.id,
      storehouseId: store.id,
    });
    expect(farming.ok && farming.value.storage[north.id]).toEqual({});
  });

  it("gathers from the tree or rock in the villager's own section", () => {
    const westHouse: Building = { ...house, id: "west_house", region: "west" };
    const westStore: Building = { ...store, id: "west_store", region: "west" };
    const s = state([{ ...villager(), houseId: westHouse.id }], {}, [FIELD], {
      buildings: [westHouse, westStore],
    });
    const result = assignVillager(s, "v1", "wood", T0);
    expect(result.ok && result.value.villagers[0]?.task).toMatchObject({
      nodeId: "west_tree",
      storehouseId: westStore.id,
    });
  });

  it("refuses an unknown villager, or one whose house is gone", () => {
    expect(assignVillager(state([{ ...villager(), houseId: "gone" }]), "v1", "wood", T0)).toEqual({
      ok: false,
      reason: "no_villager",
    });
    expect(assignVillager(state([]), "nobody", "wood", T0)).toEqual({
      ok: false,
      reason: "no_villager",
    });
  });

  it("works through applyAction, settling deliveries first", () => {
    const s = state([villager(gatherWood)]);
    const result = applyAction(
      s,
      { type: "villager.assign", payload: { villagerId: "v1", job: "idle" } },
      deliveryTime(gatherWood, tree, 1),
    );
    expect(result.ok && result.value.storage[store.id]).toEqual({ wood: VILLAGER_LOAD });
    expect(result.ok && result.value.villagers[0]?.task).toBeNull();
  });
});
