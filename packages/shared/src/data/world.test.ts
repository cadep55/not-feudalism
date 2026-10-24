import { describe, expect, it } from "vitest";
import { MoveTo } from "../protocol/messages.ts";
import { SPAWN_POINT, STARTING_REGION } from "./world.ts";

describe("world data", () => {
  it("uses a snake_case region ID", () => {
    expect(STARTING_REGION).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("spawns new characters on a tile players are allowed to move to", () => {
    expect(MoveTo.safeParse(SPAWN_POINT).success).toBe(true);
  });
});
