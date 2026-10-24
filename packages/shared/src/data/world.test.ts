import { describe, expect, it } from "vitest";
import { MoveTo } from "../protocol/messages.ts";
import { isRegionId, REGIONS, SPAWN_POINT, STARTING_REGION } from "./world.ts";

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
