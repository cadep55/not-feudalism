import { describe, expect, it } from "vitest";
import { MoveTo } from "../protocol/messages.ts";
import { footprint, STARTING_BUILDINGS } from "./buildings.ts";
import { STARTING_FIELDS } from "./farming.ts";
import { nodeYielding, RESOURCE_NODES } from "./resources.ts";
import {
  CONNECTIONS,
  inRect,
  isRegionId,
  isWater,
  REGION_IDS,
  REGIONS,
  SECTION_SIZE,
  SPAWN_POINT,
  STARTING_REGION,
  TRAVEL_ZONE_TILES,
  travelZonesIn,
} from "./world.ts";

describe("world data", () => {
  it("uses a snake_case region ID", () => {
    expect(STARTING_REGION).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("spawns new characters on a tile players are allowed to move to", () => {
    expect(MoveTo.safeParse(SPAWN_POINT).success).toBe(true);
    const region = REGIONS[STARTING_REGION];
    expect(SPAWN_POINT.x).toBeLessThan(region.width);
    expect(SPAWN_POINT.y).toBeLessThan(region.height);
  });

  it("knows which region IDs exist", () => {
    expect(isRegionId(STARTING_REGION)).toBe(true);
    expect(isRegionId("atlantis")).toBe(false);
    expect(isRegionId("toString")).toBe(false);
  });

  it("gives every region a positive size that fits the protocol's coordinate limit", () => {
    for (const region of Object.values(REGIONS)) {
      expect(region.width).toBeGreaterThan(0);
      expect(region.height).toBeGreaterThan(0);
      expect(MoveTo.safeParse({ x: region.width - 1, y: region.height - 1 }).success).toBe(true);
    }
  });
});

describe("the world's sections", () => {
  it("has 10 sections of the same size, each on its own grid square", () => {
    expect(REGION_IDS).toHaveLength(10);
    const squares = REGION_IDS.map((id) => `${REGIONS[id].col},${REGIONS[id].row}`);
    expect(new Set(squares).size).toBe(10);
    for (const id of REGION_IDS) {
      expect(REGIONS[id]).toMatchObject(SECTION_SIZE);
      expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("makes the three east sections partly water, and only the island unreachable", () => {
    const partlyWater = REGION_IDS.filter(
      (id) => REGIONS[id].water.length > 0 && REGIONS[id].reachable,
    );
    expect(partlyWater.sort()).toEqual(["east_coast", "northeast_coast", "southeast_coast"]);
    const unreachable = REGION_IDS.filter((id) => !REGIONS[id].reachable);
    expect(unreachable.sort()).toEqual(["north_isle", "south_isle"]);
    expect(REGIONS[STARTING_REGION].reachable).toBe(true);
  });

  it("knows which tiles are water", () => {
    expect(isWater("east_coast", { x: 21, y: 5 })).toBe(true);
    expect(isWater("east_coast", { x: 20, y: 5 })).toBe(false);
    expect(isWater("heartland", { x: 24, y: 0 })).toBe(false);
    expect(isWater("north_isle", { x: 12, y: 1 })).toBe(true);
    expect(isWater("north_isle", { x: 12, y: 17 })).toBe(false);
    expect(isWater("atlantis", { x: 0, y: 0 })).toBe(false);
  });
});

describe("connections and travel zones", () => {
  it("joins only sections next to each other on the grid, each pair once", () => {
    const seen = new Set<string>();
    for (const [a, b] of CONNECTIONS) {
      const key = [a, b].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const steps =
        Math.abs(REGIONS[a].col - REGIONS[b].col) + Math.abs(REGIONS[a].row - REGIONS[b].row);
      expect(steps).toBe(1);
    }
  });

  it("keeps the island joined only to itself, so it can't be walked to", () => {
    const island = new Set(["north_isle", "south_isle"]);
    for (const [a, b] of CONNECTIONS) expect(island.has(a)).toBe(island.has(b));
  });

  it("puts every travel zone in the middle of an edge, on land, with a matching zone on the other side", () => {
    for (const region of REGION_IDS) {
      for (const zone of travelZonesIn(region)) {
        const { tiles } = zone;
        expect(Math.max(tiles.width, tiles.height)).toBe(TRAVEL_ZONE_TILES);
        expect(Math.min(tiles.width, tiles.height)).toBe(1);
        const { width, height } = REGIONS[region];
        const onEdge =
          tiles.x === 0 ||
          tiles.y === 0 ||
          tiles.x + tiles.width === width ||
          tiles.y + tiles.height === height;
        expect(onEdge).toBe(true);
        for (let y = tiles.y; y < tiles.y + tiles.height; y++) {
          for (let x = tiles.x; x < tiles.x + tiles.width; x++) {
            expect(isWater(region, { x, y })).toBe(false);
            expect(inRect(tiles, { x, y })).toBe(true);
          }
        }
        const back = travelZonesIn(zone.to).find((z) => z.to === region);
        const opposite = { n: "s", s: "n", e: "w", w: "e" } as const;
        expect(back?.side).toBe(opposite[zone.side]);
      }
    }
  });

  it("lets heartland out on all four sides, and nowhere else has a zone to the island", () => {
    expect(
      travelZonesIn("heartland")
        .map((z) => z.side)
        .sort(),
    ).toEqual(["e", "n", "s", "w"]);
    expect(travelZonesIn("heartland").find((z) => z.side === "n")?.tiles).toEqual({
      x: 11,
      y: 0,
      width: 3,
      height: 1,
    });
    expect(travelZonesIn("east_coast").map((z) => z.to)).not.toContain("north_isle");
    expect(travelZonesIn("atlantis")).toEqual([]);
  });
});

describe("every reachable section fits a new player's base", () => {
  it.each(REGION_IDS.filter((id) => REGIONS[id].reachable))(
    "%s has the tree and rock in the starting spots, and no water under the starting base",
    (region) => {
      expect(RESOURCE_NODES[nodeYielding(region, "wood") ?? "heartland_tree"]).toMatchObject({
        x: RESOURCE_NODES.heartland_tree.x,
        y: RESOURCE_NODES.heartland_tree.y,
      });
      expect(RESOURCE_NODES[nodeYielding(region, "stone") ?? "heartland_rock"]).toMatchObject({
        x: RESOURCE_NODES.heartland_rock.x,
        y: RESOURCE_NODES.heartland_rock.y,
      });
      const base = [
        ...STARTING_BUILDINGS.flatMap((b) => footprint(b)),
        ...STARTING_FIELDS,
        SPAWN_POINT,
      ];
      for (const tile of base) expect(isWater(region, tile)).toBe(false);
    },
  );
});
