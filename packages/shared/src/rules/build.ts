import {
  BUILD_COSTS,
  BUILD_DURATION_MS,
  BUILDING_LIMITS,
  BUILDING_SIZES,
  type Building,
  type BuildingKind,
  CARRY_LIMIT,
  covers,
  REMOVE_DURATION_MS,
  STOREHOUSE_LIMIT,
} from "../data/buildings.ts";
import type { ItemId } from "../data/items.ts";
import { RESOURCE_NODES } from "../data/resources.ts";
import { VILLAGER_NAMES, VILLAGERS_PER_HOUSE } from "../data/villagers.ts";
import { isRegionId, isWater, REGIONS } from "../data/world.ts";
import type { CharacterState, GameState, Inventory, Villager } from "../game/state.ts";
import { fail, ok, type RuleResult } from "../result.ts";
import { buildingAt, buildingsOf, storehousesByDistance } from "./buildings.ts";
import { addItems, hasItems, removeItems } from "./inventory.ts";
import {
  pickVillagerNames,
  returnRake,
  taskTarget,
  taskTimeline,
  villagerRoute,
} from "./villagers.ts";

// Rules: docs/design/buildings.md.

export type BuildFailure =
  | "not_your_section"
  | "busy"
  | "building_limit"
  | "missing_materials"
  | "out_of_bounds"
  | "cannot_build_here";

export type RemoveFailure =
  | "busy"
  | "no_building"
  | "last_building"
  | "storehouse_not_empty"
  | "no_room_for_refund";

/** What placement looks at: where the character is, and what's already on the map. */
export type PlacementWorld = Pick<GameState, "buildings" | "fields"> & {
  character: Pick<CharacterState, "region" | "x" | "y">;
};

/**
 * Why a building of this kind can't go with its top-left at (x, y), or null
 * when it can. The footprint and a clear tile on every side must be on the
 * map and free of buildings, resource nodes and fields, and the character
 * can't be standing on the footprint.
 */
export function placementBlocked(
  state: PlacementWorld,
  kind: BuildingKind,
  x: number,
  y: number,
): "out_of_bounds" | "cannot_build_here" | null {
  const { region } = state.character;
  if (!isRegionId(region)) return "cannot_build_here";
  const map = REGIONS[region];
  const { width, height } = BUILDING_SIZES[kind];
  if (x < 0 || y < 0 || x + width > map.width || y + height > map.height) return "out_of_bounds";
  // The clear ring has to fit on the map too: no building against the edge.
  // Water counts as taken, in the footprint and the ring.
  if (x < 1 || y < 1 || x + width + 1 > map.width || y + height + 1 > map.height) {
    return "cannot_build_here";
  }
  for (let ty = y - 1; ty <= y + height; ty++) {
    for (let tx = x - 1; tx <= x + width; tx++) {
      const tile = { x: tx, y: ty };
      if (buildingAt(state.buildings, region, tile)) return "cannot_build_here";
      const onNode = Object.values(RESOURCE_NODES).some(
        (n) => n.region === region && n.x === tx && n.y === ty,
      );
      const onField = state.fields.some((f) => f.region === region && f.x === tx && f.y === ty);
      if (onNode || onField || isWater(region, tile)) return "cannot_build_here";
    }
  }
  if (covers({ id: "", region, kind, x, y, width, height }, state.character)) {
    return "cannot_build_here";
  }
  return null;
}

/**
 * Starts putting up a building: the cost comes out of the inventory now, and
 * the building appears when the job completes. Expects a settled state.
 */
export function startBuild(
  state: GameState,
  kind: BuildingKind,
  x: number,
  y: number,
  now: number,
): RuleResult<GameState, BuildFailure> {
  // TODO(design): allies may build in each other's sections (#55).
  if (state.character.region !== state.character.homeRegion) return fail("not_your_section");
  if (state.job) return fail("busy");
  if (buildingsOf(state, kind).length >= BUILDING_LIMITS[kind]) return fail("building_limit");
  const cost = BUILD_COSTS[kind];
  if (!hasItems(state.inventory, cost)) return fail("missing_materials");
  const blocked = placementBlocked(state, kind, x, y);
  if (blocked) return fail(blocked);
  const building: Building = {
    // One job at a time, so the start time can't repeat.
    id: `${kind}_${now}`,
    region: state.character.region,
    kind,
    x,
    y,
    ...BUILDING_SIZES[kind],
  };
  return ok({
    ...state,
    inventory: removeItems(state.inventory, cost),
    job: { kind: "build", building, startedAt: now, completesAt: now + BUILD_DURATION_MS },
  });
}

/** Names for a new house's villagers: different from everyone's already here, when the list allows. */
function newVillagers(state: GameState, house: Building): Villager[] {
  const taken = new Set(state.villagers.map((v) => v.name));
  const candidates = pickVillagerNames(`${state.character.id}:${house.id}`, VILLAGER_NAMES.length);
  const fresh = candidates.filter((name) => !taken.has(name));
  const names = [...fresh, ...candidates].slice(0, VILLAGERS_PER_HOUSE);
  let next =
    Math.max(0, ...state.villagers.map((v) => Number(/^v(\d+)$/.exec(v.id)?.[1] ?? 0))) + 1;
  return names.map((name) => ({ id: `v${next++}`, name, houseId: house.id, task: null }));
}

/** The finished building: a storehouse starts empty, a house brings its villagers. */
export function completeBuild(state: GameState, building: Building): GameState {
  const buildings = [...state.buildings, building];
  if (building.kind === "storehouse") {
    return { ...state, buildings, storage: { ...state.storage, [building.id]: {} } };
  }
  return { ...state, buildings, villagers: [...state.villagers, ...newVillagers(state, building)] };
}

/**
 * Where a refund goes: into the inventory up to the carry limit, the rest
 * into the nearest storehouse up to its limit. Null when it doesn't all fit.
 */
function payRefund(
  state: GameState,
  refund: Inventory,
  nearest: Building | undefined,
): Pick<GameState, "inventory" | "storage"> | null {
  let { inventory, storage } = state;
  for (const [key, amount = 0] of Object.entries(refund)) {
    const item = key as ItemId;
    const carried = Math.max(0, Math.min(amount, CARRY_LIMIT - (inventory[item] ?? 0)));
    if (carried > 0) inventory = addItems(inventory, item, carried);
    const rest = amount - carried;
    if (rest === 0) continue;
    if (!nearest) return null;
    const stored = storage[nearest.id] ?? {};
    if ((stored[item] ?? 0) + rest > STOREHOUSE_LIMIT) return null;
    storage = { ...storage, [nearest.id]: addItems(stored, item, rest) };
  }
  return { inventory, storage };
}

/** Whether a villager's walking timeline would differ between two sets of buildings. */
function routeChanged(state: GameState, villager: Villager, before: Building[]): boolean {
  const { task } = villager;
  const target = task && taskTarget(state, task);
  const was = villagerRoute(before, villager);
  const now = villagerRoute(state.buildings, villager);
  if (!task || !target || !was || !now) return false;
  const a = taskTimeline(task, target, was);
  const b = taskTimeline(task, target, now);
  return JSON.stringify([a.door, a.work, a.drop]) !== JSON.stringify([b.door, b.work, b.drop]);
}

/**
 * Takes a building down: checked and paid up front, out of use straight away;
 * the job is the 5 seconds it takes. A removed house's villagers stop, return
 * their rakes and leave. Villagers who delivered to a removed storehouse start
 * over with the nearest one left, and any villager whose path changed because
 * tiles were freed starts over too. Expects a settled state.
 */
export function startRemove(
  state: GameState,
  buildingId: string,
  now: number,
): RuleResult<GameState, RemoveFailure> {
  if (state.job) return fail("busy");
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building) return fail("no_building");
  if (buildingsOf(state, building.kind).length <= 1) return fail("last_building");
  if (building.kind === "storehouse" && Object.keys(state.storage[building.id] ?? {}).length > 0) {
    return fail("storehouse_not_empty");
  }

  const buildings = state.buildings.filter((b) => b.id !== building.id);
  const [nearest] = storehousesByDistance(buildings, building.region, building);
  const paid = payRefund(state, BUILD_COSTS[building.kind], nearest);
  if (!paid) return fail("no_room_for_refund");
  let { storage } = paid;
  if (building.kind === "storehouse") {
    const { [building.id]: _gone, ...rest } = storage;
    storage = rest;
  }

  const villagers: Villager[] = [];
  for (const villager of state.villagers) {
    const { task } = villager;
    if (villager.houseId === building.id) {
      // Leaves for good; a farmer's rake goes back first.
      if (task?.kind === "harvest") storage = returnRake(storage, buildings, task.storehouseId);
      continue;
    }
    if (task?.storehouseId === building.id) {
      const target = taskTarget(state, task) ?? building;
      const [closest] = storehousesByDistance(buildings, building.region, target);
      if (closest) {
        villagers.push({
          ...villager,
          task: { ...task, storehouseId: closest.id, since: now, delivered: 0 },
        });
        continue;
      }
    }
    villagers.push(villager);
  }

  const after: GameState = { ...state, ...paid, storage, buildings, villagers };
  return ok({
    ...after,
    villagers: after.villagers.map((v) =>
      v.task && routeChanged(after, v, state.buildings)
        ? { ...v, task: { ...v.task, since: now, delivered: 0 } }
        : v,
    ),
    job: { kind: "remove", building, startedAt: now, completesAt: now + REMOVE_DURATION_MS },
  });
}
