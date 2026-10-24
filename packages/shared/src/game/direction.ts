/** The 8 ways a character can face (owner decision, 2026-10-24). */
export const DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

export type Direction = (typeof DIRECTIONS)[number];

/** Which way new characters face. */
export const DEFAULT_FACING: Direction = "s";

/** One-tile step for each direction. y grows downwards, so north is y - 1. */
export const DIRECTION_VECTORS: Record<Direction, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
  nw: { x: -1, y: -1 },
};

export function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}

/**
 * The direction from one tile toward another (by the sign of each axis), or
 * null when they're the same tile. Works for any distance.
 */
export function directionBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
): Direction | null {
  const x = Math.sign(to.x - from.x);
  const y = Math.sign(to.y - from.y);
  if (x === 0 && y === 0) return null;
  const match = DIRECTIONS.find(
    (d) => DIRECTION_VECTORS[d].x === x && DIRECTION_VECTORS[d].y === y,
  );
  if (!match) throw new Error(`No direction for (${x}, ${y})`);
  return match;
}

/** The tile directly in front of a position. */
export function tileInFront(position: { x: number; y: number }, facing: Direction) {
  const step = DIRECTION_VECTORS[facing];
  return { x: position.x + step.x, y: position.y + step.y };
}
