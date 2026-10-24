import { MOVE_SLACK_TILES, WALK_SPEED_TILES_PER_SECOND } from "../data/movement.ts";
import { isRegionId, REGIONS } from "../data/world.ts";
import type { CharacterState } from "../game/state.ts";
import type { MoveTo } from "../protocol/messages.ts";
import { fail, ok, type RuleResult } from "../result.ts";

/** Tiles between two points when diagonal steps are allowed (Chebyshev distance). */
export function tileDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** The farthest a character could have walked since its last saved move. */
export function maxWalkTiles(elapsedMs: number): number {
  return (
    Math.floor((WALK_SPEED_TILES_PER_SECOND * Math.max(0, elapsedMs)) / 1000) + MOVE_SLACK_TILES
  );
}

/**
 * Moves a character to a tile in its current region, if it could have walked
 * there since its last move. `now` is milliseconds since the epoch.
 */
export function moveTo(
  character: CharacterState,
  target: MoveTo,
  now: number,
): RuleResult<CharacterState, "out_of_bounds" | "moved_too_fast"> {
  if (!isRegionId(character.region)) {
    throw new Error(`Character ${character.id} is in unknown region "${character.region}"`);
  }
  const region = REGIONS[character.region];
  if (target.x >= region.width || target.y >= region.height) return fail("out_of_bounds");
  if (tileDistance(character, target) > maxWalkTiles(now - character.movedAt)) {
    return fail("moved_too_fast");
  }
  return ok({ ...character, x: target.x, y: target.y, movedAt: now });
}
