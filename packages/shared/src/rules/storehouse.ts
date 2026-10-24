import { BUILDINGS, CARRY_LIMIT, covers, STOREHOUSE_LIMIT } from "../data/buildings.ts";
import type { ItemId } from "../data/items.ts";
import { tileInFront } from "../game/direction.ts";
import type { GameState } from "../game/state.ts";
import { fail, ok, type RuleResult } from "../result.ts";
import { addItems, removeItems } from "./inventory.ts";

export type StorehouseFailure =
  | "not_at_storehouse"
  | "not_enough_items"
  | "hands_full"
  | "storehouse_full";

/** True when the character stands beside the storehouse and faces it. */
export function atStorehouse(state: GameState): boolean {
  const storehouse = BUILDINGS.heartland_storehouse;
  const { character } = state;
  if (character.region !== storehouse.region) return false;
  if (covers(storehouse, character)) return false;
  return covers(storehouse, tileInFront(character, character.facing));
}

/** Moves items from the character's hands into the storehouse (at most 100 of each stored). */
export function storeItems(
  state: GameState,
  item: ItemId,
  quantity: number,
): RuleResult<GameState, StorehouseFailure> {
  if (!atStorehouse(state)) return fail("not_at_storehouse");
  if ((state.inventory[item] ?? 0) < quantity) return fail("not_enough_items");
  if ((state.storage[item] ?? 0) + quantity > STOREHOUSE_LIMIT) return fail("storehouse_full");
  return ok({
    ...state,
    inventory: removeItems(state.inventory, { [item]: quantity }),
    storage: addItems(state.storage, item, quantity),
  });
}

/** Moves items from the storehouse into the character's hands (at most 5 of each carried). */
export function takeItems(
  state: GameState,
  item: ItemId,
  quantity: number,
): RuleResult<GameState, StorehouseFailure> {
  if (!atStorehouse(state)) return fail("not_at_storehouse");
  if ((state.storage[item] ?? 0) < quantity) return fail("not_enough_items");
  if ((state.inventory[item] ?? 0) + quantity > CARRY_LIMIT) return fail("hands_full");
  return ok({
    ...state,
    inventory: addItems(state.inventory, item, quantity),
    storage: removeItems(state.storage, { [item]: quantity }),
  });
}

/** Whether the character can carry `amount` more of an item. */
export function canCarry(state: GameState, item: ItemId, amount: number): boolean {
  return (state.inventory[item] ?? 0) + amount <= CARRY_LIMIT;
}
