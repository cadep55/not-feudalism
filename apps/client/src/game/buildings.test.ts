import { BUILDINGS, type Building, covers, tileInFront } from "@nf/shared";
import { describe, expect, it } from "vitest";
import {
  approachTile,
  buildingAt,
  buildingsIn,
  facingToward,
  isBeside,
  readyAtBuilding,
  turnTowardBuilding,
} from "./buildings.ts";

const REGION = { width: 25, height: 18 };
const STOREHOUSE = BUILDINGS.heartland_storehouse; // (15, 8), 2x2

function buildingOn(x: number, y: number): Building {
  return { region: "heartland", kind: "storehouse", x, y, width: 2, height: 2 };
}

describe("buildingsIn and buildingAt", () => {
  it("lists the region's buildings", () => {
    expect(buildingsIn("heartland")).toEqual(["heartland_storehouse", "heartland_house"]);
    expect(buildingsIn("nowhere")).toEqual([]);
  });

  it("finds the building on any tile of its footprint", () => {
    for (const tile of [
      { x: 15, y: 8 },
      { x: 16, y: 8 },
      { x: 15, y: 9 },
      { x: 16, y: 9 },
    ]) {
      expect(buildingAt(tile, "heartland")).toBe("heartland_storehouse");
    }
    expect(buildingAt({ x: 6, y: 13 }, "heartland")).toBe("heartland_house");
  });

  it("returns null next to a building, or in another region", () => {
    expect(buildingAt({ x: 17, y: 8 }, "heartland")).toBeNull();
    expect(buildingAt({ x: 14, y: 9 }, "heartland")).toBeNull();
    expect(buildingAt({ x: 15, y: 8 }, "nowhere")).toBeNull();
  });
});

describe("isBeside", () => {
  it("is true on the sides and corners around the footprint", () => {
    expect(isBeside({ x: 14, y: 8 }, STOREHOUSE)).toBe(true);
    expect(isBeside({ x: 17, y: 9 }, STOREHOUSE)).toBe(true);
    expect(isBeside({ x: 16, y: 7 }, STOREHOUSE)).toBe(true);
    expect(isBeside({ x: 14, y: 10 }, STOREHOUSE)).toBe(true);
  });

  it("is false inside the footprint or further away", () => {
    expect(isBeside({ x: 15, y: 8 }, STOREHOUSE)).toBe(false);
    expect(isBeside({ x: 13, y: 8 }, STOREHOUSE)).toBe(false);
    expect(isBeside({ x: 18, y: 11 }, STOREHOUSE)).toBe(false);
  });
});

describe("facingToward", () => {
  it("faces straight at the side the character stands on", () => {
    expect(facingToward({ x: 14, y: 9 }, STOREHOUSE)).toBe("e");
    expect(facingToward({ x: 17, y: 8 }, STOREHOUSE)).toBe("w");
    expect(facingToward({ x: 16, y: 7 }, STOREHOUSE)).toBe("s");
    expect(facingToward({ x: 15, y: 10 }, STOREHOUSE)).toBe("n");
  });

  it("faces diagonally from a corner", () => {
    expect(facingToward({ x: 14, y: 7 }, STOREHOUSE)).toBe("se");
    expect(facingToward({ x: 17, y: 10 }, STOREHOUSE)).toBe("nw");
  });

  it("always puts a footprint tile in front, from every tile beside the building", () => {
    for (let y = 6; y <= 11; y++) {
      for (let x = 13; x <= 18; x++) {
        const tile = { x, y };
        const facing = facingToward(tile, STOREHOUSE);
        if (isBeside(tile, STOREHOUSE)) {
          expect(facing).not.toBeNull();
          if (facing) expect(covers(STOREHOUSE, tileInFront(tile, facing))).toBe(true);
        } else {
          expect(facing).toBeNull();
        }
      }
    }
  });

  it("is null when standing on the building", () => {
    expect(facingToward({ x: 16, y: 9 }, STOREHOUSE)).toBeNull();
  });
});

describe("turnTowardBuilding", () => {
  it("needs no turn when the tile in front is already part of the building", () => {
    expect(turnTowardBuilding({ x: 14, y: 8 }, STOREHOUSE, "e")).toBeNull();
    // Diagonally into the footprint from a side works too.
    expect(turnTowardBuilding({ x: 14, y: 8 }, STOREHOUSE, "se")).toBeNull();
  });

  it("turns toward the building when facing away or when the facing is unknown", () => {
    expect(turnTowardBuilding({ x: 14, y: 8 }, STOREHOUSE, "w")).toBe("e");
    expect(turnTowardBuilding({ x: 14, y: 8 }, STOREHOUSE, null)).toBe("e");
    expect(turnTowardBuilding({ x: 17, y: 10 }, STOREHOUSE, "s")).toBe("nw");
  });

  it("doesn't turn when no turn would help", () => {
    expect(turnTowardBuilding({ x: 15, y: 8 }, STOREHOUSE, null)).toBeNull();
    expect(turnTowardBuilding({ x: 10, y: 10 }, STOREHOUSE, "n")).toBeNull();
  });
});

describe("approachTile", () => {
  it("stays put when already beside the building", () => {
    expect(approachTile({ x: 14, y: 8 }, STOREHOUSE, REGION)).toEqual({ x: 14, y: 8 });
    expect(approachTile({ x: 17, y: 10 }, STOREHOUSE, REGION)).toEqual({ x: 17, y: 10 });
  });

  it("picks the closest side tile", () => {
    expect(approachTile({ x: 10, y: 8 }, STOREHOUSE, REGION)).toEqual({ x: 14, y: 8 });
    expect(approachTile({ x: 16, y: 2 }, STOREHOUSE, REGION)).toEqual({ x: 16, y: 7 });
    expect(approachTile({ x: 22, y: 9 }, STOREHOUSE, REGION)).toEqual({ x: 17, y: 9 });
  });

  it("prefers a side over a corner when both are equally far", () => {
    // (14, 7) the corner and (15, 7) the side are both 4 steps away.
    expect(approachTile({ x: 11, y: 3 }, STOREHOUSE, REGION)).toEqual({ x: 15, y: 7 });
  });

  it("steps out when standing inside the footprint", () => {
    const tile = approachTile({ x: 15, y: 8 }, STOREHOUSE, REGION);
    expect(tile && isBeside(tile, STOREHOUSE)).toBe(true);
    expect(tile && covers(STOREHOUSE, tile)).toBe(false);
  });

  it("always picks a tile beside the footprint, never inside it", () => {
    for (let y = 0; y < REGION.height; y++) {
      for (let x = 0; x < REGION.width; x++) {
        const tile = approachTile({ x, y }, STOREHOUSE, REGION);
        expect(tile).not.toBeNull();
        if (!tile) continue;
        expect(isBeside(tile, STOREHOUSE)).toBe(true);
        expect(covers(STOREHOUSE, tile)).toBe(false);
      }
    }
  });

  it("never picks a tile off the map", () => {
    // (-1, 2) would be as close, but it's off the map.
    expect(approachTile({ x: 0, y: 5 }, buildingOn(0, 0), REGION)).toEqual({ x: 0, y: 2 });
  });

  it("never picks a tile with a node on it", () => {
    // The tree stands at (5, 5): just left of a building at (6, 5).
    expect(approachTile({ x: 0, y: 5 }, buildingOn(6, 5), REGION)).toEqual({ x: 5, y: 6 });
  });

  it("returns null when every tile around the building is off the map", () => {
    expect(approachTile({ x: 3, y: 3 }, buildingOn(0, 0), { width: 2, height: 2 })).toBeNull();
  });
});

describe("readyAtBuilding", () => {
  const base = {
    position: { x: 14, y: 8 },
    lastSent: { x: 14, y: 8 },
    inFlight: false,
    stepping: false,
    building: STOREHOUSE,
  };

  it("is ready once standing beside the building and the server knows it", () => {
    expect(readyAtBuilding(base)).toBe(true);
  });

  it("waits while walking or while the position is unacknowledged", () => {
    expect(readyAtBuilding({ ...base, stepping: true })).toBe(false);
    expect(readyAtBuilding({ ...base, inFlight: true })).toBe(false);
    expect(readyAtBuilding({ ...base, lastSent: { x: 13, y: 8 } })).toBe(false);
  });

  it("is never ready inside the footprint or away from it", () => {
    const inside = { x: 15, y: 8 };
    expect(readyAtBuilding({ ...base, position: inside, lastSent: inside })).toBe(false);
    const far = { x: 10, y: 10 };
    expect(readyAtBuilding({ ...base, position: far, lastSent: far })).toBe(false);
  });
});
