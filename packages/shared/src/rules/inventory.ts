import type { ItemId } from "../data/items.ts";
import type { Inventory } from "../game/state.ts";

export function addItems(inventory: Inventory, item: ItemId, amount: number): Inventory {
  return { ...inventory, [item]: (inventory[item] ?? 0) + amount };
}

/** True when the inventory holds at least every listed amount. */
export function hasItems(inventory: Inventory, needed: Inventory): boolean {
  return Object.entries(needed).every(
    ([item, amount]) => (inventory[item as ItemId] ?? 0) >= (amount ?? 0),
  );
}

/** Takes the listed amounts out. Items that reach zero are dropped. Check hasItems first. */
export function removeItems(inventory: Inventory, taken: Inventory): Inventory {
  const result: Inventory = { ...inventory };
  for (const [key, amount] of Object.entries(taken)) {
    const item = key as ItemId;
    const left = (result[item] ?? 0) - (amount ?? 0);
    if (left < 0) throw new Error(`Not enough ${item} to remove`);
    if (left === 0) delete result[item];
    else result[item] = left;
  }
  return result;
}
