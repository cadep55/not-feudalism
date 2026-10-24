import { isRegionId, REGIONS } from "../data/world.ts";
import type { CharacterState } from "../game/state.ts";
import type { MoveTo } from "../protocol/messages.ts";
import { fail, ok, type RuleResult } from "../result.ts";

/**
 * Moves a character to a tile in its current region.
 * Walking speed checks arrive with map movement in issue #17.
 */
export function moveTo(
  character: CharacterState,
  target: MoveTo,
): RuleResult<CharacterState, "out_of_bounds"> {
  if (!isRegionId(character.region)) {
    throw new Error(`Character ${character.id} is in unknown region "${character.region}"`);
  }
  const region = REGIONS[character.region];
  if (target.x >= region.width || target.y >= region.height) return fail("out_of_bounds");
  return ok({ ...character, x: target.x, y: target.y });
}
