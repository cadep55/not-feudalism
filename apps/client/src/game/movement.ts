import { WALK_SPEED_TILES_PER_SECOND } from "@nf/shared";

export type Tile = { x: number; y: number };
export type RegionSize = { width: number; height: number };

/** Milliseconds per tile step, so the client walks exactly as fast as the server allows. */
export const STEP_MS = 1000 / WALK_SPEED_TILES_PER_SECOND;

/** Minimum gap between position updates sent to the server while walking. */
export const SEND_INTERVAL_MS = 500;

/** The next tile on the way from `from` to `to`, moving diagonally when both axes differ. */
export function stepToward(from: Tile, to: Tile): Tile {
  return { x: from.x + Math.sign(to.x - from.x), y: from.y + Math.sign(to.y - from.y) };
}

export function clampToRegion(tile: Tile, region: RegionSize): Tile {
  return {
    x: Math.min(Math.max(tile.x, 0), region.width - 1),
    y: Math.min(Math.max(tile.y, 0), region.height - 1),
  };
}

export function samePlace(a: Tile, b: Tile): boolean {
  return a.x === b.x && a.y === b.y;
}

/** The tile under a point in pixels, or null when the point is off the map. */
export function tileAt(px: number, py: number, tileSize: number, region: RegionSize): Tile | null {
  const tile = { x: Math.floor(px / tileSize), y: Math.floor(py / tileSize) };
  const inside = tile.x >= 0 && tile.y >= 0 && tile.x < region.width && tile.y < region.height;
  return inside ? tile : null;
}

export type HeldKeys = { up: boolean; down: boolean; left: boolean; right: boolean };

/** The direction held keys point in, one tile per axis; {0,0} when nothing (or opposites) is held. */
export function keyDirection(keys: HeldKeys): Tile {
  return {
    x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
    y: (keys.down ? 1 : 0) - (keys.up ? 1 : 0),
  };
}

/**
 * Whether to send the current position now: only when it changed since the
 * last send, never while a send is in flight, and at most every
 * SEND_INTERVAL_MS unless the character has stopped walking.
 */
export function shouldSend(options: {
  position: Tile;
  lastSent: Tile;
  lastSentAt: number;
  now: number;
  inFlight: boolean;
  walking: boolean;
}): boolean {
  if (options.inFlight || samePlace(options.position, options.lastSent)) return false;
  return !options.walking || options.now - options.lastSentAt >= SEND_INTERVAL_MS;
}
