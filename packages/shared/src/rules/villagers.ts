import { BUILDINGS, covers, footprint, STOREHOUSE_LIMIT } from "../data/buildings.ts";
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
import { REGIONS } from "../data/world.ts";
import type { GameState, Inventory, Villager, VillagerTask } from "../game/state.ts";
import { fail, ok, type RuleResult } from "../result.ts";
import { harvestOnce } from "./farming.ts";
import { addItems, removeItems } from "./inventory.ts";
import { tileDistance } from "./move.ts";

// Rules: docs/design/villagers.md. Phase 1: one house and one storehouse (heartland).

type Tile = { x: number; y: number };

const HOUSE = BUILDINGS.heartland_house;
const STOREHOUSE = BUILDINGS.heartland_storehouse;

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

/** The tile just below the house, where villagers set out from. */
export function houseDoor(): Tile {
  return { x: HOUSE.x, y: HOUSE.y + HOUSE.height };
}

function blocked(tile: Tile): boolean {
  const size = REGIONS[HOUSE.region];
  if (tile.x < 0 || tile.y < 0 || tile.x >= size.width || tile.y >= size.height) return true;
  if (Object.values(BUILDINGS).some((b) => covers(b, tile))) return true;
  return Object.values(RESOURCE_NODES).some((n) => n.x === tile.x && n.y === tile.y);
}

/** The free tiles around a tile or a building footprint. */
function tilesAround(targets: Tile[]): Tile[] {
  const seen = new Set(targets.map((t) => `${t.x},${t.y}`));
  const around: Tile[] = [];
  for (const target of targets) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tile = { x: target.x + dx, y: target.y + dy };
        const key = `${tile.x},${tile.y}`;
        if (seen.has(key) || blocked(tile)) continue;
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

/** Where a villager stands to work a target: the free neighbouring tile closest to the storehouse. */
export function workSpot(target: Tile): Tile {
  return closestTo(tilesAround([target]), { x: STOREHOUSE.x, y: STOREHOUSE.y });
}

/** Where a villager drops off: the free tile beside the storehouse closest to its work spot. */
export function dropOffSpot(from: Tile): Tile {
  return closestTo(tilesAround(footprint(STOREHOUSE)), from);
}

function walkMs(from: Tile, to: Tile): number {
  return (tileDistance(from, to) * 1000) / VILLAGER_WALK_TILES_PER_SECOND;
}

/** The fixed timeline of a task working at `target` (see docs/design/villagers.md). */
export function taskTimeline(task: VillagerTask, target: Tile) {
  const work = workSpot(target);
  const drop = dropOffSpot(work);
  const outbound = walkMs(houseDoor(), work);
  const load = VILLAGER_LOAD * VILLAGER_GATHER_MS;
  const leg = walkMs(work, drop);
  return { work, drop, outbound, load, leg, cycle: load + 2 * leg, since: task.since };
}

/** Deliveries a task has made by `now`: delivery k lands at since + outbound + k·cycle − leg. */
export function deliveriesBy(task: VillagerTask, target: Tile, now: number): number {
  const t = taskTimeline(task, target);
  const elapsed = now - t.since - t.outbound + t.leg;
  return Math.max(0, Math.floor(elapsed / t.cycle));
}

/** What a working villager is doing at `now`, and where (fractional tiles while walking). */
export function villagerActivity(
  task: VillagerTask,
  target: Tile,
  now: number,
): { activity: "walking" | "gathering"; x: number; y: number } {
  const t = taskTimeline(task, target);
  const along = (from: Tile, to: Tile, done: number, total: number) => {
    const f = total <= 0 ? 1 : Math.min(1, Math.max(0, done / total));
    return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
  };
  const elapsed = now - t.since;
  if (elapsed < t.outbound) {
    return { activity: "walking", ...along(houseDoor(), t.work, elapsed, t.outbound) };
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

function store(
  storage: Inventory,
  item: ItemId,
  amount: number,
): { storage: Inventory; full: boolean } {
  const space = STOREHOUSE_LIMIT - (storage[item] ?? 0);
  const fits = Math.min(space, amount);
  return { storage: fits > 0 ? addItems(storage, item, fits) : storage, full: fits < amount };
}

/**
 * Hands in every delivery working villagers have made since the last settle,
 * in order, into the storehouse (capped at 100 each). A villager whose
 * delivery doesn't fit, or whose field runs out, goes idle. Called before
 * every action and when state is read, like resolveJob.
 */
export function settleVillagers(state: GameState, now: number): GameState {
  let { storage, fields } = state;
  let changed = false;
  const villagers = state.villagers.map((villager): Villager => {
    const { task } = villager;
    if (!task) return villager;
    const target = taskTarget({ ...state, fields }, task);
    if (!target) {
      // Its field is gone (e.g. the player harvested the last of it): idle, rake back.
      changed = true;
      if (task.kind === "harvest") storage = addItems(storage, "rake", 1);
      return { ...villager, task: null };
    }
    const due = deliveriesBy(task, target, now) - task.delivered;
    if (due <= 0) return villager;
    changed = true;
    for (let d = 0; d < due; d++) {
      if (task.kind === "gather") {
        const result = store(storage, RESOURCE_NODES[task.nodeId].yields, VILLAGER_LOAD);
        storage = result.storage;
        if (result.full) return { ...villager, task: null };
        continue;
      }
      // Harvest: each unit is one harvest from the field, by the same rules as the player.
      for (let unit = 0; unit < VILLAGER_LOAD; unit++) {
        const taken = harvestOnce(fields, task.fieldId);
        if (!taken) {
          storage = addItems(storage, "rake", 1);
          return { ...villager, task: null };
        }
        fields = taken.fields;
        const wheat = store(storage, "wheat", 1);
        storage = wheat.storage;
        if (taken.seed) storage = store(storage, "wheat_seeds", 1).storage;
        if (wheat.full) {
          storage = addItems(storage, "rake", 1);
          return { ...villager, task: null };
        }
      }
    }
    return { ...villager, task: { ...task, delivered: task.delivered + due } };
  });
  return changed ? { ...state, storage, fields, villagers } : state;
}

/**
 * Gives a villager a job (or makes it idle). Farming takes a rake from the
 * storehouse and works the grown field nearest the storehouse; leaving farming
 * puts the rake back. Expects a settled state.
 */
export function assignVillager(
  state: GameState,
  villagerId: string,
  job: VillagerJob,
  now: number,
): RuleResult<GameState, "no_villager" | "no_rake_in_storehouse" | "no_field"> {
  const villager = state.villagers.find((v) => v.id === villagerId);
  if (!villager) return fail("no_villager");

  let storage =
    villager.task?.kind === "harvest" ? addItems(state.storage, "rake", 1) : state.storage;
  let task: VillagerTask | null = null;
  if (job === "wood" || job === "stone") {
    const nodeId = job === "wood" ? "heartland_tree" : "heartland_rock";
    task = { kind: "gather", nodeId, since: now, delivered: 0 };
  } else if (job === "wheat") {
    if (!storage.rake) return fail("no_rake_in_storehouse");
    const grown = state.fields.filter((f) => f.readyAt <= now && f.region === HOUSE.region);
    if (grown.length === 0) return fail("no_field");
    const store = { x: STOREHOUSE.x, y: STOREHOUSE.y };
    const field = grown.reduce((a, b) => (tileDistance(b, store) < tileDistance(a, store) ? b : a));
    storage = removeItems(storage, { rake: 1 });
    task = { kind: "harvest", fieldId: field.id, since: now, delivered: 0 };
  }
  return ok({
    ...state,
    storage,
    villagers: state.villagers.map((v) => (v.id === villagerId ? { ...v, task } : v)),
  });
}
