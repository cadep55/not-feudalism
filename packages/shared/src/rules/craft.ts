import { RECIPES, type RecipeId } from "../data/recipes.ts";
import type { GameState } from "../game/state.ts";
import { fail, ok, type RuleResult } from "../result.ts";
import { hasItems, removeItems } from "./inventory.ts";

/**
 * Starts crafting: the recipe's inputs are taken straight away, and the output
 * arrives when the job completes. Crafting works anywhere and keeps going while
 * the character walks. Expects a resolved state.
 */
export function startCraft(
  state: GameState,
  recipeId: RecipeId,
  now: number,
): RuleResult<GameState, "busy" | "missing_materials"> {
  const recipe = RECIPES[recipeId];
  if (state.job) return fail("busy");
  if (!hasItems(state.inventory, recipe.inputs)) return fail("missing_materials");
  return ok({
    ...state,
    inventory: removeItems(state.inventory, recipe.inputs),
    job: { kind: "craft", recipeId, startedAt: now, completesAt: now + recipe.durationMs },
  });
}
