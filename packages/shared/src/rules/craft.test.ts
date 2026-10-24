import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ITEM_IDS, type ItemId } from "../data/items.ts";
import { RECIPE_IDS, RECIPES } from "../data/recipes.ts";
import type { GameState, Inventory } from "../game/state.ts";
import { applyAction } from "./actions.ts";
import { startCraft } from "./craft.ts";
import { resolveJob } from "./jobs.ts";

const NOW = 1_000_000;

function stateWith(inventory: Inventory, overrides: Partial<GameState> = {}): GameState {
  return {
    character: {
      id: "c1",
      name: "Alice",
      rank: "peasant",
      gold: 0,
      region: "heartland",
      x: 10,
      y: 10,
      movedAt: 0,
    },
    inventory,
    job: null,
    ...overrides,
  };
}

describe("startCraft", () => {
  it("takes the inputs straight away and starts a 3-second job", () => {
    expect(startCraft(stateWith({ wood: 3, stone: 1 }), "rake", NOW)).toEqual({
      ok: true,
      value: stateWith(
        { wood: 1 },
        { job: { kind: "craft", recipeId: "rake", startedAt: NOW, completesAt: NOW + 3_000 } },
      ),
    });
  });

  it("refuses without enough materials, and takes nothing", () => {
    for (const inventory of [{}, { wood: 2 }, { wood: 1, stone: 5 }]) {
      expect(startCraft(stateWith(inventory), "rake", NOW)).toEqual({
        ok: false,
        reason: "missing_materials",
      });
    }
  });

  it("refuses while another job is running", () => {
    const gathering = stateWith(
      { wood: 2, stone: 1 },
      {
        job: { kind: "gather", nodeId: "heartland_tree", startedAt: NOW, completesAt: NOW + 3_000 },
      },
    );
    expect(startCraft(gathering, "rake", NOW)).toEqual({ ok: false, reason: "busy" });
  });
});

describe("craft jobs", () => {
  const crafting = stateWith(
    {},
    { job: { kind: "craft", recipeId: "rake", startedAt: NOW, completesAt: NOW + 3_000 } },
  );

  it("deliver the output when the time is up", () => {
    expect(resolveJob(crafting, NOW + 2_999)).toBe(crafting);
    expect(resolveJob(crafting, NOW + 3_000)).toEqual({
      ...crafting,
      inventory: { rake: 1 },
      job: null,
    });
  });

  it("keep going while the character walks", () => {
    const walked = applyAction(
      crafting,
      { type: "move.to", payload: { x: 11, y: 10 } },
      NOW + 1_000,
    );
    expect(walked.ok && walked.value.job).toEqual(crafting.job);
  });

  it("then let the rake harvest wheat", () => {
    const withRake = resolveJob(crafting, NOW + 3_000);
    expect(withRake.inventory.rake).toBe(1);
  });
});

// Property test (docs/CONVENTIONS.md §4): crafting never creates or destroys
// items, except exactly as the recipe says.
describe("item conservation", () => {
  const inventoryArb = fc
    .record(
      Object.fromEntries(ITEM_IDS.map((id) => [id, fc.integer({ min: 0, max: 10 })])) as Record<
        ItemId,
        fc.Arbitrary<number>
      >,
    )
    .map((counts) => {
      const inventory: Inventory = {};
      for (const id of ITEM_IDS) if (counts[id] > 0) inventory[id] = counts[id];
      return inventory;
    });

  it("start + finish changes each count by exactly output minus inputs, or nothing at all", () => {
    fc.assert(
      fc.property(inventoryArb, fc.constantFrom(...RECIPE_IDS), (inventory, recipeId) => {
        const recipe = RECIPES[recipeId];
        const started = startCraft(stateWith(inventory), recipeId, NOW);
        if (!started.ok) {
          // Refused: nothing may change, and it must really have been short of something.
          const short = Object.entries(recipe.inputs).some(
            ([item, need]) => (inventory[item as ItemId] ?? 0) < need,
          );
          expect(short).toBe(true);
          return;
        }
        const finished = resolveJob(started.value, started.value.job?.completesAt ?? NOW);
        for (const id of ITEM_IDS) {
          const input = (recipe.inputs as Partial<Record<ItemId, number>>)[id] ?? 0;
          const output = recipe.output.item === id ? recipe.output.quantity : 0;
          const before = inventory[id] ?? 0;
          const after = finished.inventory[id] ?? 0;
          expect(after).toBe(before - input + output);
          expect(after).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
});
