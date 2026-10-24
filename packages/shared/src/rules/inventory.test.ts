import { describe, expect, it } from "vitest";
import { addItems, hasItems, removeItems } from "./inventory.ts";

describe("inventory helpers", () => {
  it("addItems adds to an existing count or starts one", () => {
    expect(addItems({ wood: 1 }, "wood", 2)).toEqual({ wood: 3 });
    expect(addItems({}, "stone", 1)).toEqual({ stone: 1 });
  });

  it("hasItems checks every listed amount", () => {
    expect(hasItems({ wood: 2, stone: 1 }, { wood: 2, stone: 1 })).toBe(true);
    expect(hasItems({ wood: 5 }, { wood: 2, stone: 1 })).toBe(false);
    expect(hasItems({}, {})).toBe(true);
  });

  it("removeItems subtracts and drops items that reach zero", () => {
    expect(removeItems({ wood: 3, stone: 1 }, { wood: 2, stone: 1 })).toEqual({ wood: 1 });
  });

  it("removeItems refuses to go below zero (a bug, not a player mistake)", () => {
    expect(() => removeItems({ wood: 1 }, { wood: 2 })).toThrow(/Not enough wood/);
  });

  it("never mutates its input", () => {
    const inventory = { wood: 3 };
    removeItems(inventory, { wood: 1 });
    addItems(inventory, "wood", 1);
    expect(inventory).toEqual({ wood: 3 });
  });
});
