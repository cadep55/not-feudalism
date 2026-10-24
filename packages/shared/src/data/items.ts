// Every item in the game. Rules, the server and the UI read names and kinds from here.

export const ITEMS = {
  wood: { name: "Wood", kind: "resource" },
  stone: { name: "Stone", kind: "resource" },
  wheat: { name: "Wheat", kind: "resource" },
  // The first tool. Recipe (2 wood + 1 stone) arrives with crafting in issue #20.
  rake: { name: "Rake", kind: "tool" },
} as const satisfies Record<string, { name: string; kind: "resource" | "tool" }>;

export type ItemId = keyof typeof ITEMS;

export const ITEM_IDS = Object.keys(ITEMS) as [ItemId, ...ItemId[]];

export function isItemId(value: string): value is ItemId {
  return Object.hasOwn(ITEMS, value);
}
