import {
  type Building,
  deliveriesBy,
  type GameState,
  RESOURCE_NODES,
  taskTarget,
  taskTimeline,
  type VillagerJob,
  type VillagerTask,
  villagerRoute,
  WANDER_RADIUS,
} from "@nf/shared";
import { buildingAt } from "./buildings.ts";
import { JOB_SETTLE_MS, nodeAt } from "./gathering.ts";
import type { RegionSize, Tile } from "./movement.ts";

// Client-side helpers for drawing villagers and keeping their deliveries fresh.
// Rules: docs/design/villagers.md. Idle wandering is visual only; the server never sees it.

/** A point on the map in tiles; fractional while a villager is between tiles. */
export type Point = { x: number; y: number };

/** How fast idle villagers stroll, in tiles per second: an unhurried amble (visual only). */
export const WANDER_TILES_PER_SECOND = 1.5;
/** Idle villagers pause this long (a random time in between) after each stroll. */
export const WANDER_PAUSE_MIN_MS = 2_000;
export const WANDER_PAUSE_MAX_MS = 5_000;
/** Never re-read state more often than this while villagers work, whatever the clocks say. */
export const MIN_VILLAGER_REFRESH_MS = 1_000;

/** The job a task stands for, as the Villagers panel's dropdown shows it. */
export function villagerJob(task: VillagerTask | null): VillagerJob {
  if (!task) return "idle";
  if (task.kind === "harvest") return "wheat";
  return RESOURCE_NODES[task.nodeId].yields === "wood" ? "wood" : "stone";
}

/** Dropdown text per job. */
export const JOB_LABELS: Record<VillagerJob, string> = {
  idle: "Idle",
  wood: "Gather wood",
  stone: "Gather stone",
  wheat: "Harvest wheat",
};

const STATUS_TEXT: Record<VillagerJob, string> = {
  idle: "Idle",
  wood: "Gathering wood",
  stone: "Gathering stone",
  wheat: "Harvesting wheat",
};

/** What the Villagers panel says a villager is doing. */
export function villagerStatus(task: VillagerTask | null): string {
  return STATUS_TEXT[villagerJob(task)];
}

/**
 * Milliseconds until the next delivery of any working villager is due, plus a
 * settle margin for clock drift, so re-reading state then shows it in the
 * storehouse. Null when no villager works (or none has a target left).
 */
export function nextVillagerRefresh(state: GameState, now: number): number | null {
  let soonest: number | null = null;
  for (const villager of state.villagers) {
    const task = villager.task;
    if (!task) continue;
    const target = taskTarget(state, task);
    const route = villagerRoute(state.buildings, villager);
    if (!target || !route) continue;
    const t = taskTimeline(task, target, route);
    const next = deliveriesBy(task, target, route, now) + 1;
    const dueAt = t.since + t.outbound + next * t.cycle - t.leg;
    if (soonest === null || dueAt < soonest) soonest = dueAt;
  }
  if (soonest === null) return null;
  return Math.max(soonest + JOB_SETTLE_MS - now, MIN_VILLAGER_REFRESH_MS);
}

/** Whether an idle villager may stand on a tile: on the map, not a building or a resource node. */
export function canWanderTo(
  tile: Tile,
  region: RegionSize,
  regionId: string,
  buildings: readonly Building[],
): boolean {
  const onMap = tile.x >= 0 && tile.y >= 0 && tile.x < region.width && tile.y < region.height;
  return onMap && !buildingAt(buildings, tile, regionId) && !nodeAt(tile, regionId);
}

/** Where an idle villager wanders: around its house's door, steering clear of buildings. */
export type Home = { door: Tile; region: string; buildings: readonly Building[] };

/**
 * A random free tile within WANDER_RADIUS of the house door for an idle
 * villager to stroll to. `rng` returns numbers in [0, 1) like Math.random.
 */
export function pickWanderTile(rng: () => number, region: RegionSize, home: Home): Tile {
  const { door } = home;
  const choices: Tile[] = [];
  for (let dy = -WANDER_RADIUS; dy <= WANDER_RADIUS; dy++) {
    for (let dx = -WANDER_RADIUS; dx <= WANDER_RADIUS; dx++) {
      const tile = { x: door.x + dx, y: door.y + dy };
      if (canWanderTo(tile, region, home.region, home.buildings)) choices.push(tile);
    }
  }
  const index = Math.min(Math.floor(rng() * choices.length), choices.length - 1);
  return choices[index] ?? door;
}

/** One stroll: walk from `from` to `to` between departAt and arriveAt, then rest until nextAt. */
export type Stroll = { from: Point; to: Tile; departAt: number; arriveAt: number; nextAt: number };

/** Plans an idle villager's next stroll from where it stands, starting now. */
export function planStroll(
  from: Point,
  now: number,
  rng: () => number,
  region: RegionSize,
  home: Home,
): Stroll {
  const to = pickWanderTile(rng, region, home);
  const distance = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const arriveAt = now + (distance * 1000) / WANDER_TILES_PER_SECOND;
  const pause = WANDER_PAUSE_MIN_MS + rng() * (WANDER_PAUSE_MAX_MS - WANDER_PAUSE_MIN_MS);
  return { from, to, departAt: now, arriveAt, nextAt: arriveAt + pause };
}

/** Where a strolling villager is at `now`: along the way, then at the destination. */
export function strollPosition(stroll: Stroll, now: number): Point {
  const total = stroll.arriveAt - stroll.departAt;
  const f = total <= 0 ? 1 : Math.min(1, Math.max(0, (now - stroll.departAt) / total));
  return {
    x: stroll.from.x + (stroll.to.x - stroll.from.x) * f,
    y: stroll.from.y + (stroll.to.y - stroll.from.y) * f,
  };
}
