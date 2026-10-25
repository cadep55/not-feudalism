import { describe, expect, it } from "vitest";
import { STARTING_BUILDINGS, STARTING_STOREHOUSE } from "../data/buildings.ts";
import {
  FIELD_GROW_MS,
  FIELD_SEEDS,
  FIELD_WHEAT,
  HARVEST_DURATION_MS,
  SEED_EVERY,
} from "../data/farming.ts";
import { RESOURCE_NODES } from "../data/resources.ts";
import type { Direction } from "../game/direction.ts";
import type { Field, GameState, Inventory } from "../game/state.ts";
import { applyAction } from "./actions.ts";
import {
  completeHarvest,
  fieldId,
  newField,
  plantingBlocked,
  plantSeed,
  startHarvest,
} from "./farming.ts";
import { resolveJob } from "./jobs.ts";

const NOW = 10_000_000;
const FIELD = newField("heartland", 13, 14, 0);
// East of the field, facing it.
const BESIDE = { x: 14, y: 14, facing: "w" as Direction };

function state(
  where: { x: number; y: number; facing: Direction } = BESIDE,
  inventory: Inventory = { rake: 1 },
  fields: Field[] = [FIELD],
): GameState {
  return {
    character: {
      id: "c1",
      name: "Alice",
      rank: "peasant",
      gold: 0,
      region: "heartland",
      movedAt: 0,
      ...where,
    },
    inventory,
    storage: {},
    buildings: [...STARTING_BUILDINGS],
    fields,
    villagers: [],
    job: null,
  };
}

describe("fields", () => {
  it("are named by their tile and start full", () => {
    expect(FIELD).toEqual({
      id: "heartland:13,14",
      region: "heartland",
      x: 13,
      y: 14,
      wheat: FIELD_WHEAT,
      seeds: FIELD_SEEDS,
      harvests: 0,
      readyAt: 0,
    });
    expect(fieldId("heartland", 1, 2)).toBe("heartland:1,2");
  });
});

describe("startHarvest", () => {
  it("starts a 3-second harvest beside a grown field, facing it, with a rake", () => {
    const result = startHarvest(state(), FIELD.id, NOW);
    expect(result.ok && result.value.job).toEqual({
      kind: "harvest",
      fieldId: FIELD.id,
      startedAt: NOW,
      completesAt: NOW + HARVEST_DURATION_MS,
    });
  });

  it("refuses for each missing condition", () => {
    const cases: [GameState, string][] = [
      [state(BESIDE, { rake: 1 }, []), "no_field"],
      [state({ x: 16, y: 14, facing: "w" }), "too_far_away"],
      [state({ ...BESIDE, facing: "e" }), "not_facing"],
      [state(BESIDE, {}), "missing_tool"],
      [state(BESIDE, { rake: 1 }, [{ ...FIELD, readyAt: NOW + 1 }]), "field_growing"],
      [state(BESIDE, { rake: 1, wheat: 5 }), "hands_full"],
    ];
    for (const [s, reason] of cases) {
      expect(startHarvest(s, FIELD.id, NOW)).toEqual({ ok: false, reason });
    }
  });

  it("refuses when the seed this harvest would drop has no room", () => {
    const ninth = { ...FIELD, harvests: SEED_EVERY - 1 };
    expect(
      startHarvest(state(BESIDE, { rake: 1, wheat_seeds: 5 }, [ninth]), FIELD.id, NOW),
    ).toEqual({
      ok: false,
      reason: "hands_full",
    });
  });
});

describe("completeHarvest", () => {
  it("gives one wheat and takes one from the field", () => {
    const after = completeHarvest(state(), FIELD.id);
    expect(after.inventory).toEqual({ rake: 1, wheat: 1 });
    expect(after.fields).toEqual([{ ...FIELD, wheat: FIELD_WHEAT - 1, harvests: 1 }]);
  });

  it("drops a seed every 10th harvest", () => {
    const ninth = { ...FIELD, harvests: SEED_EVERY - 1, wheat: 41 };
    const after = completeHarvest(state(BESIDE, { rake: 1 }, [ninth]), FIELD.id);
    expect(after.inventory).toEqual({ rake: 1, wheat: 1, wheat_seeds: 1 });
    expect(after.fields[0]).toMatchObject({ seeds: FIELD_SEEDS - 1, harvests: SEED_EVERY });
  });

  it("removes the field when its last wheat is taken", () => {
    const last = { ...FIELD, wheat: 1, seeds: 1, harvests: 49 };
    const after = completeHarvest(state(BESIDE, { rake: 1 }, [last]), FIELD.id);
    expect(after.fields).toEqual([]);
    expect(after.inventory).toEqual({ rake: 1, wheat: 1, wheat_seeds: 1 });
  });

  it("yields exactly 50 wheat and 5 seeds over a field's life", () => {
    // completeHarvest doesn't enforce the carry limit (startHarvest does), so this
    // can count a whole field's output in one inventory.
    let s = state(BESIDE, { rake: 1 });
    let harvests = 0;
    while (s.fields.length > 0) {
      s = completeHarvest(s, FIELD.id);
      harvests++;
    }
    expect(harvests).toBe(FIELD_WHEAT);
    expect(s.inventory.wheat).toBe(FIELD_WHEAT);
    expect(s.inventory.wheat_seeds).toBe(FIELD_SEEDS);
  });

  it("yields nothing if the field is already gone", () => {
    const empty = state(BESIDE, { rake: 1 }, []);
    expect(completeHarvest(empty, FIELD.id)).toBe(empty);
  });

  it("resolves through the job system", () => {
    const started = startHarvest(state(), FIELD.id, NOW);
    if (!started.ok) throw new Error("setup failed");
    const done = resolveJob(started.value, NOW + HARVEST_DURATION_MS);
    expect(done.job).toBeNull();
    expect(done.inventory.wheat).toBe(1);
  });
});

describe("planting", () => {
  // Facing an empty grass tile north of (10, 10).
  const OPEN = { x: 10, y: 10, facing: "n" as Direction };

  it("plants a seed in front, growing for 5 minutes", () => {
    const result = plantSeed(state(OPEN, { wheat_seeds: 2 }, []), NOW);
    expect(result.ok && result.value.inventory).toEqual({ wheat_seeds: 1 });
    expect(result.ok && result.value.fields).toEqual([
      newField("heartland", 10, 9, NOW + FIELD_GROW_MS),
    ]);
  });

  it("refuses without seeds, while busy, off the map, or on anything but grass", () => {
    expect(plantSeed(state(OPEN, {}, []), NOW)).toEqual({ ok: false, reason: "no_seeds" });
    const busy = {
      ...state(OPEN, { wheat_seeds: 1 }, []),
      job: {
        kind: "craft" as const,
        recipeId: "rake" as const,
        startedAt: 0,
        completesAt: NOW + 1,
      },
    };
    expect(plantSeed(busy, NOW)).toEqual({ ok: false, reason: "busy" });
    expect(plantSeed(state({ x: 0, y: 0, facing: "n" }, { wheat_seeds: 1 }, []), NOW)).toEqual({
      ok: false,
      reason: "out_of_bounds",
    });

    const tree = RESOURCE_NODES.heartland_tree;
    const store = STARTING_STOREHOUSE;
    for (const target of [tree, { x: store.x, y: store.y }, { x: FIELD.x, y: FIELD.y }]) {
      expect(plantingBlocked(state(OPEN, {}, [FIELD]), target)).toBe("cannot_plant_here");
    }
  });

  it("can't be harvested until grown", () => {
    const planted = plantSeed(state(OPEN, { wheat_seeds: 1, rake: 1 }, []), NOW);
    if (!planted.ok) throw new Error("setup failed");
    const field = planted.value.fields[0];
    if (!field) throw new Error("no field");
    expect(startHarvest(planted.value, field.id, NOW + FIELD_GROW_MS - 1)).toEqual({
      ok: false,
      reason: "field_growing",
    });
    expect(startHarvest(planted.value, field.id, NOW + FIELD_GROW_MS).ok).toBe(true);
  });
});

describe("harvest through actions", () => {
  it("walking away cancels a harvest", () => {
    const started = applyAction(
      state(),
      { type: "field.harvest", payload: { fieldId: FIELD.id } },
      NOW,
    );
    if (!started.ok) throw new Error("setup failed");
    const walked = applyAction(
      started.value,
      { type: "move.to", payload: { x: 15, y: 14 } },
      NOW + 1_000,
    );
    expect(walked.ok && walked.value.job).toBeNull();
  });
});
