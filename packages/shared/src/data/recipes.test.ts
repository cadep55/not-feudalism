import { describe, expect, it } from "vitest";
import { isItemId } from "./items.ts";
import { isRecipeId, RECIPE_IDS, RECIPES } from "./recipes.ts";

describe("recipe data", () => {
  it.each(RECIPE_IDS)("%s uses real items, positive whole amounts and time", (id) => {
    const recipe = RECIPES[id];
    expect(isItemId(recipe.output.item)).toBe(true);
    expect(Number.isInteger(recipe.output.quantity) && recipe.output.quantity > 0).toBe(true);
    expect(recipe.durationMs).toBeGreaterThan(0);
    const inputs = Object.entries(recipe.inputs);
    expect(inputs.length).toBeGreaterThan(0);
    for (const [item, amount] of inputs) {
      expect(isItemId(item)).toBe(true);
      expect(Number.isInteger(amount) && amount > 0).toBe(true);
    }
  });

  it("never uses its own output as an input (no cycles)", () => {
    for (const id of RECIPE_IDS) {
      expect(Object.keys(RECIPES[id].inputs)).not.toContain(RECIPES[id].output.item);
    }
  });

  it("matches the owner's rake recipe: 2 wood + 1 stone, 3 seconds", () => {
    expect(RECIPES.rake).toEqual({
      inputs: { wood: 2, stone: 1 },
      output: { item: "rake", quantity: 1 },
      durationMs: 3_000,
    });
  });

  it("recognises recipe IDs", () => {
    expect(isRecipeId("rake")).toBe(true);
    expect(isRecipeId("sword")).toBe(false);
  });
});
