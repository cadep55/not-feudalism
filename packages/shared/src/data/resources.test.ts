import { describe, expect, it } from "vitest";
import { ITEMS, isItemId } from "./items.ts";
import {
  GATHER_DURATION_MS,
  GATHER_YIELD,
  isNodeId,
  NODE_IDS,
  nodeYielding,
  RESOURCE_NODES,
  type ResourceNode,
} from "./resources.ts";
import { isWater, REGION_IDS, REGIONS, SPAWN_POINT, STARTING_REGION } from "./world.ts";

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
    const node: ResourceNode = RESOURCE_NODES[id];
    expect(isItemId(node.yields)).toBe(true);
    if (node.requires) expect(ITEMS[node.requires].kind).toBe("tool");
    const region = REGIONS[node.region];
    expect(node.x).toBeGreaterThanOrEqual(0);
    expect(node.y).toBeGreaterThanOrEqual(0);
    expect(node.x).toBeLessThan(region.width);
    expect(node.y).toBeLessThan(region.height);
  });

  it("keeps nodes off the spawn point, off each other, off water and away from the shore", () => {
    const spots = NODE_IDS.map((id) => {
      const node = RESOURCE_NODES[id];
      return `${node.region}:${node.x},${node.y}`;
    });
    expect(new Set(spots).size).toBe(spots.length);
    expect(spots).not.toContain(`${STARTING_REGION}:${SPAWN_POINT.x},${SPAWN_POINT.y}`);
    for (const id of NODE_IDS) {
      const node = RESOURCE_NODES[id];
      // Water on any side would leave fewer places to stand and gather.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          expect(isWater(node.region, { x: node.x + dx, y: node.y + dy })).toBe(false);
        }
      }
    }
  });

  it.each(REGION_IDS)("%s has one tree for wood and one rock for stone", (region) => {
    const here = NODE_IDS.filter((id) => RESOURCE_NODES[id].region === region);
    expect(here.map((id) => RESOURCE_NODES[id].yields).sort()).toEqual(["stone", "wood"]);
    expect(nodeYielding(region, "wood")).toBe(`${region}_tree`);
    expect(nodeYielding(region, "stone")).toBe(`${region}_rock`);
    expect(nodeYielding(region, "wheat")).toBeNull();
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
