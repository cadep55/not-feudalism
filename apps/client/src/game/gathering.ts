import {
  type Job,
  NODE_IDS,
  type NodeId,
  RESOURCE_NODES,
  type ResourceNode,
  tileDistance,
} from "@nf/shared";
import type { RegionSize, Tile } from "./movement.ts";

/** Extra wait after a job's end before asking the server for the result, to allow for clock drift. */
export const JOB_SETTLE_MS = 250;

/** The resource nodes drawn on a region's map. */
export function nodesIn(region: string): NodeId[] {
  return NODE_IDS.filter((id) => RESOURCE_NODES[id].region === region);
}

/** The node standing on a tile, or null when the tile is plain ground. */
export function nodeAt(tile: Tile, region: string): NodeId | null {
  return (
    nodesIn(region).find((id) => {
      const node = RESOURCE_NODES[id];
      return node.x === tile.x && node.y === tile.y;
    }) ?? null
  );
}

/** Whether a character on `tile` is close enough to gather at `node` (the server's rule). */
export function isNextTo(tile: Tile, node: ResourceNode): boolean {
  return tileDistance(tile, node) <= 1;
}

/**
 * Where to stand to gather at `node`: `from` itself when already next to it,
 * otherwise the closest free tile around the node (on the map and not another
 * node). Ties prefer the straighter approach. Null when no tile is free.
 */
export function nearestAdjacentTile(
  from: Tile,
  node: ResourceNode,
  region: RegionSize,
): Tile | null {
  if (isNextTo(from, node)) return from;
  let best: { tile: Tile; steps: number; straightLine: number } | null = null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tile = { x: node.x + dx, y: node.y + dy };
      const onMap = tile.x >= 0 && tile.y >= 0 && tile.x < region.width && tile.y < region.height;
      if (!onMap || nodeAt(tile, node.region) !== null) continue;
      const steps = tileDistance(from, tile);
      const straightLine = (tile.x - from.x) ** 2 + (tile.y - from.y) ** 2;
      // Fewest steps first; the straight-line distance only breaks ties.
      if (
        !best ||
        steps < best.steps ||
        (steps === best.steps && straightLine < best.straightLine)
      ) {
        best = { tile, steps, straightLine };
      }
    }
  }
  return best?.tile ?? null;
}

/** How far along a job is, from 0 (just started) to 1 (done). */
export function jobProgress(job: Job, now: number): number {
  const total = job.completesAt - job.startedAt;
  if (total <= 0) return 1;
  return Math.min(Math.max((now - job.startedAt) / total, 0), 1);
}

/** Milliseconds to wait before re-reading state so the server has finished the job. */
export function refreshDelay(job: Job, now: number): number {
  return Math.max(job.completesAt - now, 0) + JOB_SETTLE_MS;
}

/**
 * Whether to ask the server to start gathering now: standing still next to the
 * node, and the server has acknowledged where we stand (nothing in flight, the
 * last position sent is the current one).
 */
export function readyToGather(options: {
  position: Tile;
  lastSent: Tile;
  inFlight: boolean;
  stepping: boolean;
  node: ResourceNode;
}): boolean {
  const { position, lastSent } = options;
  return (
    !options.inFlight &&
    !options.stepping &&
    position.x === lastSent.x &&
    position.y === lastSent.y &&
    isNextTo(position, options.node)
  );
}
