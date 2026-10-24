import { DIRECTION_VECTORS, type Direction, directionBetween } from "@nf/shared";
import type { Tile } from "./movement.ts";

/**
 * Which way the character faces after stepping from `from` to `to`: the way it
 * stepped, diagonals included (the server's rule for move.to). Unchanged when
 * the step goes nowhere.
 */
export function facingAfterStep(from: Tile, to: Tile, current: Direction): Direction {
  return directionBetween(from, to) ?? current;
}

/**
 * The direction to turn before gathering at `node`, or null when no turn is
 * needed. `facing` is what the server last confirmed; null (unknown) always
 * asks for a turn. Standing on the node can't be fixed by turning, so that is
 * null too (step off first).
 */
export function turnBeforeGather(
  position: Tile,
  node: Tile,
  facing: Direction | null,
): Direction | null {
  const toward = directionBetween(position, node);
  if (toward === null || toward === facing) return null;
  return toward;
}

/**
 * Where to draw the facing arrow relative to the character's centre, and its
 * rotation in radians (0 points east; y grows downward, so south is +π/2).
 */
export function arrowPlacement(
  facing: Direction,
  distance: number,
): { x: number; y: number; angle: number } {
  const v = DIRECTION_VECTORS[facing];
  return { x: v.x * distance, y: v.y * distance, angle: Math.atan2(v.y, v.x) };
}
