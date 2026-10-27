import {
  FIELD_GROW_MS,
  FIELD_SEEDS,
  FIELD_WHEAT,
  HARVEST_DURATION_MS,
  SEED_EVERY,
} from "../data/farming.ts";
import { RESOURCE_NODES } from "../data/resources.ts";
import { isRegionId, isWater, REGIONS } from "../data/world.ts";
import { directionBetween, tileInFront } from "../game/direction.ts";
import type { Field, GameState } from "../game/state.ts";
import { fail, ok, type RuleResult } from "../result.ts";
import { buildingAt } from "./buildings.ts";
import { addItems, removeItems } from "./inventory.ts";
import { tileDistance } from "./move.ts";
import { canCarry } from "./storehouse.ts";

/** A field's id: one field per tile, so its place is its name. */
export function fieldId(region: string, x: number, y: number): string {
  return `${region}:${x},${y}`;
}

/** A fully grown field, ready at `readyAt`. */
export function newField(region: string, x: number, y: number, readyAt: number): Field {
  return {
    id: fieldId(region, x, y),
    region,
    x,
    y,
    wheat: FIELD_WHEAT,
    seeds: FIELD_SEEDS,
    harvests: 0,
    readyAt,
  };
}

/** Whether the next harvest from this field also yields a seed. */
export function nextHarvestDropsSeed(field: Field): boolean {
  return (field.harvests + 1) % SEED_EVERY === 0 && field.seeds > 0;
}

/** Starts harvesting a grown field next to the character and in front of it. Needs a rake. */
export function startHarvest(
  state: GameState,
  id: string,
  now: number,
): RuleResult<
  GameState,
  | "no_field"
  | "too_far_away"
  | "not_facing"
  | "busy"
  | "missing_tool"
  | "field_growing"
  | "hands_full"
> {
  const field = state.fields.find((f) => f.id === id);
  if (!field) return fail("no_field");
  const { character } = state;
  if (field.region !== character.region || tileDistance(character, field) > 1) {
    return fail("too_far_away");
  }
  if (directionBetween(character, field) !== character.facing) return fail("not_facing");
  if (state.job) return fail("busy");
  if (!state.inventory.rake) return fail("missing_tool");
  if (now < field.readyAt) return fail("field_growing");
  if (!canCarry(state, "wheat", 1)) return fail("hands_full");
  if (nextHarvestDropsSeed(field) && !canCarry(state, "wheat_seeds", 1)) return fail("hands_full");
  return ok({
    ...state,
    job: { kind: "harvest", fieldId: id, startedAt: now, completesAt: now + HARVEST_DURATION_MS },
  });
}

/**
 * Takes one harvest from a field: one wheat, plus a seed every SEED_EVERY
 * harvests. A field whose wheat runs out disappears. Returns null when the
 * field is already gone. Shared by players and farming villagers.
 */
export function harvestOnce(
  fields: Field[],
  id: string,
): { fields: Field[]; seed: boolean } | null {
  const field = fields.find((f) => f.id === id);
  if (!field || field.wheat <= 0) return null;
  const seed = nextHarvestDropsSeed(field);
  const harvested: Field = {
    ...field,
    wheat: field.wheat - 1,
    seeds: seed ? field.seeds - 1 : field.seeds,
    harvests: field.harvests + 1,
  };
  return {
    seed,
    fields:
      harvested.wheat > 0
        ? fields.map((f) => (f.id === id ? harvested : f))
        : fields.filter((f) => f.id !== id),
  };
}

/** The result of the player's finished harvest, added to what they carry. */
export function completeHarvest(state: GameState, id: string): GameState {
  // The field may already be gone (e.g. emptied); the harvest then yields nothing.
  const taken = harvestOnce(state.fields, id);
  if (!taken) return state;
  let inventory = addItems(state.inventory, "wheat", 1);
  if (taken.seed) inventory = addItems(inventory, "wheat_seeds", 1);
  return { ...state, inventory, fields: taken.fields };
}

/** Why a tile can't be planted, or null when it's free grass. */
export function plantingBlocked(
  state: GameState,
  tile: { x: number; y: number },
): "out_of_bounds" | "cannot_plant_here" | null {
  const { region } = state.character;
  if (!isRegionId(region)) return "cannot_plant_here";
  const size = REGIONS[region];
  if (tile.x < 0 || tile.y < 0 || tile.x >= size.width || tile.y >= size.height) {
    return "out_of_bounds";
  }
  const onNode = Object.values(RESOURCE_NODES).some(
    (n) => n.region === region && n.x === tile.x && n.y === tile.y,
  );
  const onBuilding = buildingAt(state.buildings, region, tile) !== null;
  const onField = state.fields.some((f) => f.region === region && f.x === tile.x && f.y === tile.y);
  return onNode || onBuilding || onField || isWater(region, tile) ? "cannot_plant_here" : null;
}

/** Plants one wheat seed on the free grass tile in front of the character. */
export function plantSeed(
  state: GameState,
  now: number,
): RuleResult<GameState, "no_seeds" | "out_of_bounds" | "cannot_plant_here" | "busy"> {
  if (!state.inventory.wheat_seeds) return fail("no_seeds");
  if (state.job) return fail("busy");
  const { character } = state;
  const tile = tileInFront(character, character.facing);
  const blocked = plantingBlocked(state, tile);
  if (blocked) return fail(blocked);
  return ok({
    ...state,
    inventory: removeItems(state.inventory, { wheat_seeds: 1 }),
    fields: [...state.fields, newField(character.region, tile.x, tile.y, now + FIELD_GROW_MS)],
  });
}
