import { describe, expect, it } from "vitest";
import { ITEMS, isItemId } from "./items.ts";
import {
  GATHER_DURATION_MS,
  GATHER_YIELD,
  isNodeId,
  NODE_IDS,
  RESOURCE_NODES,
} from "./resources.ts";
import { REGIONS, SPAWN_POINT } from "./world.ts";

describe("item data", () => {
  it("gives every item a unique name", () => {
    const names = Object.values(ITEMS).map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses snake_case item IDs", () => {
    for (const id of Object.keys(ITEMS)) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});

describe("resource node data", () => {
  it.each(NODE_IDS)("%s yields a real item, needs only tools, and sits on its map", (id) => {
    const node = RESOURCE_NODES[id];
    expect(isItemId(node.yields)).toBe(true);
    if (node.requires) expect(ITEMS[node.requires].kind).toBe("tool");
    const region = REGIONS[node.region];
    expect(node.x).toBeGreaterThanOrEqual(0);
    expect(node.y).toBeGreaterThanOrEqual(0);
    expect(node.x).toBeLessThan(region.width);
    expect(node.y).toBeLessThan(region.height);
  });

  it("keeps nodes off the spawn point and off each other", () => {
    const spots = NODE_IDS.map((id) => `${RESOURCE_NODES[id].x},${RESOURCE_NODES[id].y}`);
    expect(new Set(spots).size).toBe(spots.length);
    expect(spots).not.toContain(`${SPAWN_POINT.x},${SPAWN_POINT.y}`);
  });

  it("has one node for each starting resource", () => {
    const yields = NODE_IDS.map((id) => RESOURCE_NODES[id].yields).sort();
    expect(yields).toEqual(["stone", "wheat", "wood"]);
  });

  it("recognises node IDs", () => {
    expect(isNodeId("heartland_tree")).toBe(true);
    expect(isNodeId("heartland_gold_mine")).toBe(false);
  });

  it("has positive gather timing and yield", () => {
    expect(GATHER_DURATION_MS).toBeGreaterThan(0);
    expect(Number.isInteger(GATHER_YIELD) && GATHER_YIELD > 0).toBe(true);
  });
});
