import { describe, expect, it } from "vitest";
import {
  BUILDING_IDS,
  BUILDINGS,
  CARRY_LIMIT,
  covers,
  footprint,
  STOREHOUSE_LIMIT,
} from "./buildings.ts";
import { NODE_IDS, RESOURCE_NODES } from "./resources.ts";
import { REGIONS, SPAWN_POINT } from "./world.ts";

describe("building data", () => {
  it.each(BUILDING_IDS)("%s fits on its map", (id) => {
    const building = BUILDINGS[id];
    const region = REGIONS[building.region];
    for (const tile of footprint(building)) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(region.width);
      expect(tile.y).toBeLessThan(region.height);
    }
  });

  it("are 2x2, as the owner decided", () => {
    for (const id of BUILDING_IDS) expect(footprint(BUILDINGS[id])).toHaveLength(4);
  });

  it("don't overlap each other, resource nodes, the tiles beside nodes, or spawn", () => {
    const taken = new Set<string>();
    for (const id of BUILDING_IDS) {
      for (const tile of footprint(BUILDINGS[id])) {
        const key = `${tile.x},${tile.y}`;
        expect(taken.has(key)).toBe(false);
        taken.add(key);
      }
    }
    for (const id of NODE_IDS) {
      const node = RESOURCE_NODES[id];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++)
          expect(taken.has(`${node.x + dx},${node.y + dy}`)).toBe(false);
      }
    }
    expect(taken.has(`${SPAWN_POINT.x},${SPAWN_POINT.y}`)).toBe(false);
  });

  it("knows which tiles a building covers", () => {
    const store = BUILDINGS.heartland_storehouse;
    expect(covers(store, { x: store.x + 1, y: store.y + 1 })).toBe(true);
    expect(covers(store, { x: store.x + 2, y: store.y })).toBe(false);
  });

  it("uses the owner's limits: carry 5, store 100", () => {
    expect(CARRY_LIMIT).toBe(5);
    expect(STOREHOUSE_LIMIT).toBe(100);
  });
});
