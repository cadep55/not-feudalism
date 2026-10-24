import type { ItemId } from "./items.ts";

// Crafting balance (owner decisions, 2026-10-24: rake = 2 wood + 1 stone, 3 seconds, craft anywhere).

export type Recipe = {
  /** Items consumed when crafting starts. */
  inputs: Partial<Record<ItemId, number>>;
  output: { item: ItemId; quantity: number };
  durationMs: number;
};

export const RECIPES = {
  rake: { inputs: { wood: 2, stone: 1 }, output: { item: "rake", quantity: 1 }, durationMs: 3_000 },
} as const satisfies Record<string, Recipe>;

export type RecipeId = keyof typeof RECIPES;

export const RECIPE_IDS = Object.keys(RECIPES) as [RecipeId, ...RecipeId[]];

export function isRecipeId(value: string): value is RecipeId {
  return Object.hasOwn(RECIPES, value);
}
