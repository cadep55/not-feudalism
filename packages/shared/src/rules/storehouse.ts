import { CARRY_LIMIT, STOREHOUSE_LIMIT } from "../data/buildings.ts";
import type { ItemId } from "../data/items.ts";
import type { GameState, Inventory } from "../game/state.ts";
import { fail, ok, type RuleResult } from "../result.ts";
import { storehouseInFront } from "./buildings.ts";
import { addItems, removeItems } from "./inventory.ts";

export type StorehouseFailure =
  | "not_at_storehouse"
  | "not_enough_items"
  | "hands_full"
  | "storehouse_full";

/** True when the character stands beside a storehouse and faces it. */
export function atStorehouse(state: GameState): boolean {
  return storehouseInFront(state) !== null;
}

/** What a storehouse holds (empty if it has nothing, or doesn't exist). */
export function storageOf(state: GameState, storehouseId: string): Inventory {
  return state.storage[storehouseId] ?? {};
}

/** Moves items from the character's hands into the storehouse they face (at most 100 of each). */
export function storeItems(
  state: GameState,
  item: ItemId,
  quantity: number,
): RuleResult<GameState, StorehouseFailure> {
  const storehouse = storehouseInFront(state);
  if (!storehouse) return fail("not_at_storehouse");
  const stored = storageOf(state, storehouse.id);
  if ((state.inventory[item] ?? 0) < quantity) return fail("not_enough_items");
  if ((stored[item] ?? 0) + quantity > STOREHOUSE_LIMIT) return fail("storehouse_full");
  return ok({
    ...state,
    inventory: removeItems(state.inventory, { [item]: quantity }),
    storage: { ...state.storage, [storehouse.id]: addItems(stored, item, quantity) },
  });
}

/** Moves items from the storehouse the character faces into their hands (at most 5 of each). */
export function takeItems(
  state: GameState,
  item: ItemId,
  quantity: number,
): RuleResult<GameState, StorehouseFailure> {
  const storehouse = storehouseInFront(state);
  if (!storehouse) return fail("not_at_storehouse");
  const stored = storageOf(state, storehouse.id);
  if ((stored[item] ?? 0) < quantity) return fail("not_enough_items");
  if ((state.inventory[item] ?? 0) + quantity > CARRY_LIMIT) return fail("hands_full");
  return ok({
    ...state,
    inventory: addItems(state.inventory, item, quantity),
    storage: { ...state.storage, [storehouse.id]: removeItems(stored, { [item]: quantity }) },
  });
}

/** Whether the character can carry `amount` more of an item. */
export function canCarry(state: GameState, item: ItemId, amount: number): boolean {
  return (state.inventory[item] ?? 0) + amount <= CARRY_LIMIT;
}
