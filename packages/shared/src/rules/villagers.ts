import { type Building, footprint, STOREHOUSE_LIMIT } from "../data/buildings.ts";
import type { ItemId } from "../data/items.ts";
import { RESOURCE_NODES } from "../data/resources.ts";
import {
  VILLAGER_GATHER_MS,
  VILLAGER_LOAD,
  VILLAGER_NAMES,
  VILLAGER_WALK_TILES_PER_SECOND,
  VILLAGERS_PER_HOUSE,
  type VillagerJob,
} from "../data/villagers.ts";
import type { GameState, Villager, VillagerTask } from "../game/state.ts";
import { fail, ok, type RuleResult } from "../result.ts";
import {
  buildingById,
  distanceToBuilding,
  houseDoor,
  isBlocked,
  storehousesByDistance,
} from "./buildings.ts";
import { harvestOnce } from "./farming.ts";
import { addItems, removeItems } from "./inventory.ts";
import { tileDistance } from "./move.ts";

// Rules: docs/design/villagers.md and docs/design/buildings.md.

type Tile = { x: number; y: number };

/**
 * Where a working villager walks: out of its house's door, then between its
 * work spot and its storehouse. `buildings` decides which tiles are free to stand on.
 */
export type Route = { door: Tile; storehouse: Building; buildings: Building[] };

/** Picks `count` different names, the same every time for the same seed (e.g. a character id). */
export function pickVillagerNames(seed: string, count: number = VILLAGERS_PER_HOUSE): string[] {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const names: string[] = [];
  for (let i = 0; names.length < Math.min(count, VILLAGER_NAMES.length); i++) {
    const name = VILLAGER_NAMES[(hash + i * 7) % VILLAGER_NAMES.length];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** The route of a working villager, or null when idle or its house or storehouse is gone. */
export function villagerRoute(buildings: Building[], villager: Villager): Route | null {
  const { task } = villager;
  if (!task) return null;
  const house = buildings.find((b) => b.id === villager.houseId && b.kind === "house");
  const storehouse = buildings.find((b) => b.id === task.storehouseId && b.kind === "storehouse");
  if (!house || !storehouse) return null;
  return { door: houseDoor(house), storehouse, buildings };
}

/** The free tiles around a tile or a building footprint. */
function tilesAround(targets: Tile[], route: Route): Tile[] {
  const seen = new Set(targets.map((t) => `${t.x},${t.y}`));
  const around: Tile[] = [];
  for (const target of targets) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tile = { x: target.x + dx, y: target.y + dy };
        const key = `${tile.x},${tile.y}`;
        if (seen.has(key) || isBlocked(route.buildings, route.storehouse.region, tile)) continue;
        seen.add(key);
        around.push(tile);
      }
    }
  }
  return around;
}

function closestTo(candidates: Tile[], to: Tile): Tile {
  let best = candidates[0];
  if (!best) throw new Error("No free tile to stand on");
  for (const tile of candidates) {
    const d = tileDistance(tile, to);
    const bestD = tileDistance(best, to);
    // Ties go to the earlier tile, so the choice is stable.
    if (d < bestD) best = tile;
  }
  return best;
}

/** Where a villager stands to work a target: the free neighbouring tile closest to its storehouse. */
export function workSpot(target: Tile, route: Route): Tile {
  const { storehouse } = route;
  return closestTo(tilesAround([target], route), { x: storehouse.x, y: storehouse.y });
}

/** Where a villager drops off: the free tile beside its storehouse closest to its work spot. */
export function dropOffSpot(from: Tile, route: Route): Tile {
  return closestTo(tilesAround(footprint(route.storehouse), route), from);
}

function walkMs(from: Tile, to: Tile): number {
  return (tileDistance(from, to) * 1000) / VILLAGER_WALK_TILES_PER_SECOND;
}

/** The fixed timeline of a task working at `target` (see docs/design/villagers.md). */
export function taskTimeline(task: VillagerTask, target: Tile, route: Route) {
  const work = workSpot(target, route);
  const drop = dropOffSpot(work, route);
  const outbound = walkMs(route.door, work);
  const load = VILLAGER_LOAD * VILLAGER_GATHER_MS;
  const leg = walkMs(work, drop);
  return {
    door: route.door,
    work,
    drop,
    outbound,
    load,
    leg,
    cycle: load + 2 * leg,
    since: task.since,
  };
}

/** Deliveries a task has made by `now`: delivery k lands at since + outbound + k·cycle − leg. */
export function deliveriesBy(task: VillagerTask, target: Tile, route: Route, now: number): number {
  const t = taskTimeline(task, target, route);
  const elapsed = now - t.since - t.outbound + t.leg;
  return Math.max(0, Math.floor(elapsed / t.cycle));
}

/** What a working villager is doing at `now`, and where (fractional tiles while walking). */
export function villagerActivity(
  task: VillagerTask,
  target: Tile,
  route: Route,
  now: number,
): { activity: "walking" | "gathering"; x: number; y: number } {
  const t = taskTimeline(task, target, route);
  const along = (from: Tile, to: Tile, done: number, total: number) => {
    const f = total <= 0 ? 1 : Math.min(1, Math.max(0, done / total));
    return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
  };
  const elapsed = now - t.since;
  if (elapsed < t.outbound) {
    return { activity: "walking", ...along(t.door, t.work, elapsed, t.outbound) };
  }
  const inCycle = (elapsed - t.outbound) % t.cycle;
  if (inCycle < t.load) return { activity: "gathering", ...t.work };
  if (inCycle < t.load + t.leg) {
    return { activity: "walking", ...along(t.work, t.drop, inCycle - t.load, t.leg) };
  }
  return { activity: "walking", ...along(t.drop, t.work, inCycle - t.load - t.leg, t.leg) };
}

/** The tile a task works at, or null if it's gone (a field that ran out). */
export function taskTarget(state: GameState, task: VillagerTask): Tile | null {
  if (task.kind === "gather") return RESOURCE_NODES[task.nodeId];
  return state.fields.find((f) => f.id === task.fieldId) ?? null;
}

type Storage = GameState["storage"];

/**
 * Puts `amount` of an item into storehouses, in the order given, filling each
 * up to the limit. Returns how much didn't fit anywhere.
 */
function deposit(
  storage: Storage,
  order: Building[],
  item: ItemId,
  amount: number,
): { storage: Storage; left: number } {
  let left = amount;
  let result = storage;
  for (const storehouse of order) {
    if (left === 0) break;
    const stored = result[storehouse.id] ?? {};
    const fits = Math.min(STOREHOUSE_LIMIT - (stored[item] ?? 0), left);
    if (fits <= 0) continue;
    result = { ...result, [storehouse.id]: addItems(stored, item, fits) };
    left -= fits;
  }
  return { storage: result, left };
}

/** Puts a rake back: into the villager's storehouse, or the first one if that's gone. */
export function returnRake(storage: Storage, buildings: Building[], storehouseId: string): Storage {
  const home =
    buildings.find((b) => b.id === storehouseId && b.kind === "storehouse") ??
    buildings.find((b) => b.kind === "storehouse");
  if (!home) return storage;
  return { ...storage, [home.id]: addItems(storage[home.id] ?? {}, "rake", 1) };
}

/**
 * Hands in every delivery working villagers have made since the last settle,
 * in order. Each load goes into the villager's storehouse; what doesn't fit
 * goes to the next nearest, and so on (100 of each per storehouse). A villager
 * whose load doesn't fit anywhere, whose field runs out, or whose house or
 * storehouse is gone goes idle. Called before every action and when state is
 * read, like resolveJob.
 */
export function settleVillagers(state: GameState, now: number): GameState {
  let { storage, fields } = state;
  const { buildings } = state;
  let changed = false;
  const villagers = state.villagers.map((villager): Villager => {
    const { task } = villager;
    if (!task) return villager;
    const route = villagerRoute(buildings, villager);
    const target = taskTarget({ ...state, fields }, task);
    if (!target || !route) {
      // Its field is gone (e.g. the player harvested the last of it): idle, rake back.
      changed = true;
      if (task.kind === "harvest") storage = returnRake(storage, buildings, task.storehouseId);
      return { ...villager, task: null };
    }
    const due = deliveriesBy(task, target, route, now) - task.delivered;
    if (due <= 0) return villager;
    changed = true;
    const work = workSpot(target, route);
    const order = [
      route.storehouse,
      ...storehousesByDistance(buildings, route.storehouse.region, work).filter(
        (b) => b.id !== route.storehouse.id,
      ),
    ];
    for (let d = 0; d < due; d++) {
      if (task.kind === "gather") {
        const result = deposit(storage, order, RESOURCE_NODES[task.nodeId].yields, VILLAGER_LOAD);
        storage = result.storage;
        if (result.left > 0) return { ...villager, task: null };
        continue;
      }
      // Harvest: each unit is one harvest from the field, by the same rules as the player.
      for (let unit = 0; unit < VILLAGER_LOAD; unit++) {
        const taken = harvestOnce(fields, task.fieldId);
        if (!taken) {
          storage = returnRake(storage, buildings, task.storehouseId);
          return { ...villager, task: null };
        }
        fields = taken.fields;
        const wheat = deposit(storage, order, "wheat", 1);
        storage = wheat.storage;
        if (taken.seed) storage = deposit(storage, order, "wheat_seeds", 1).storage;
        if (wheat.left > 0) {
          storage = returnRake(storage, buildings, task.storehouseId);
          return { ...villager, task: null };
        }
      }
    }
    return { ...villager, task: { ...task, delivered: task.delivered + due } };
  });
  return changed ? { ...state, storage, fields, villagers } : state;
}

/** The storehouse nearest a tile. Every world keeps at least one (docs/design/buildings.md). */
function nearestStorehouse(state: GameState, region: string, tile: Tile): Building {
  const [nearest] = storehousesByDistance(state.buildings, region, tile);
  if (!nearest) throw new Error("The world has no storehouse");
  return nearest;
}

/**
 * Gives a villager a job (or makes it idle). Gathering delivers to the
 * storehouse nearest the node. Farming works the grown field nearest a
 * storehouse, takes a rake from the nearest storehouse to it that has one, and
 * delivers to the nearest; leaving farming puts the rake back. Expects a settled state.
 */
export function assignVillager(
  state: GameState,
  villagerId: string,
  job: VillagerJob,
  now: number,
): RuleResult<GameState, "no_villager" | "no_rake_in_storehouse" | "no_field"> {
  const villager = state.villagers.find((v) => v.id === villagerId);
  const house = villager && buildingById(state, villager.houseId);
  if (!villager || !house) return fail("no_villager");

  let storage =
    villager.task?.kind === "harvest"
      ? returnRake(state.storage, state.buildings, villager.task.storehouseId)
      : state.storage;
  let task: VillagerTask | null = null;
  if (job === "wood" || job === "stone") {
    const nodeId = job === "wood" ? "heartland_tree" : "heartland_rock";
    const node = RESOURCE_NODES[nodeId];
    const storehouseId = nearestStorehouse(state, node.region, node).id;
    task = { kind: "gather", nodeId, storehouseId, since: now, delivered: 0 };
  } else if (job === "wheat") {
    const storehouses = storehousesByDistance(state.buildings, house.region, house);
    if (!storehouses.some((b) => storage[b.id]?.rake)) return fail("no_rake_in_storehouse");
    const grown = state.fields.filter((f) => f.readyAt <= now && f.region === house.region);
    if (grown.length === 0) return fail("no_field");
    const nearness = (f: Tile) => Math.min(...storehouses.map((b) => distanceToBuilding(f, b)));
    const field = grown.reduce((a, b) => (nearness(b) < nearness(a) ? b : a));
    const byDistance = storehousesByDistance(state.buildings, house.region, field);
    const rakeFrom = byDistance.find((b) => storage[b.id]?.rake);
    const deliverTo = byDistance[0];
    if (!rakeFrom || !deliverTo) return fail("no_rake_in_storehouse");
    storage = { ...storage, [rakeFrom.id]: removeItems(storage[rakeFrom.id] ?? {}, { rake: 1 }) };
    task = {
      kind: "harvest",
      fieldId: field.id,
      storehouseId: deliverTo.id,
      since: now,
      delivered: 0,
    };
  }
  return ok({
    ...state,
    storage,
    villagers: state.villagers.map((v) => (v.id === villagerId ? { ...v, task } : v)),
  });
}
