import { describe, expect, it } from "vitest";
import { BUILDINGS, covers } from "./buildings.ts";
import {
  FIELD_GROW_MS,
  FIELD_SEEDS,
  FIELD_WHEAT,
  HARVEST_DURATION_MS,
  SEED_EVERY,
  STARTING_FIELDS,
} from "./farming.ts";
import { RESOURCE_NODES } from "./resources.ts";
import { REGIONS, SPAWN_POINT } from "./world.ts";

describe("farming data", () => {
  it("matches the owner's numbers: 50 wheat, 5 seeds (one every 10th), 5 minutes to grow", () => {
    expect(FIELD_WHEAT).toBe(50);
    expect(FIELD_SEEDS).toBe(5);
    expect(SEED_EVERY).toBe(10);
    expect(FIELD_WHEAT / SEED_EVERY).toBe(FIELD_SEEDS);
    expect(FIELD_GROW_MS).toBe(5 * 60 * 1000);
    expect(HARVEST_DURATION_MS).toBeGreaterThan(0);
  });

  it("puts starting fields on free grass inside their map", () => {
    for (const field of STARTING_FIELDS) {
      const region = REGIONS[field.region];
      expect(field.x).toBeLessThan(region.width);
      expect(field.y).toBeLessThan(region.height);
      expect(Object.values(RESOURCE_NODES).some((n) => n.x === field.x && n.y === field.y)).toBe(
        false,
      );
      expect(Object.values(BUILDINGS).some((b) => covers(b, field))).toBe(false);
      expect(field).not.toMatchObject(SPAWN_POINT);
    }
  });
});
