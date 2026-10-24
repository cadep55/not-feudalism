import { WALK_SPEED_TILES_PER_SECOND } from "@nf/shared";
import { describe, expect, it } from "vitest";
import {
  clampToRegion,
  keyDirection,
  SEND_INTERVAL_MS,
  STEP_MS,
  shouldSend,
  stepToward,
  tileAt,
} from "./movement.ts";

const REGION = { width: 25, height: 18 };

describe("stepToward", () => {
  it("moves one tile per step, diagonally when needed", () => {
    expect(stepToward({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual({ x: 1, y: 1 });
    expect(stepToward({ x: 1, y: 1 }, { x: 3, y: 1 })).toEqual({ x: 2, y: 1 });
    expect(stepToward({ x: 5, y: 5 }, { x: 2, y: 9 })).toEqual({ x: 4, y: 6 });
  });

  it("stays put at the destination", () => {
    expect(stepToward({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
  });
});

describe("walking speed", () => {
  it("matches the server's limit", () => {
    expect(1000 / STEP_MS).toBe(WALK_SPEED_TILES_PER_SECOND);
  });

  it("never covers more tiles between sends than the server allows without slack", () => {
    const tilesPerSend = SEND_INTERVAL_MS / STEP_MS;
    expect(tilesPerSend).toBeLessThanOrEqual(
      (WALK_SPEED_TILES_PER_SECOND * SEND_INTERVAL_MS) / 1000,
    );
  });
});

describe("clampToRegion and tileAt", () => {
  it("keeps keyboard steps on the map", () => {
    expect(clampToRegion({ x: -1, y: 20 }, REGION)).toEqual({ x: 0, y: 17 });
  });

  it("maps a click to a tile, or null off the map", () => {
    expect(tileAt(70, 33, 32, REGION)).toEqual({ x: 2, y: 1 });
    expect(tileAt(25 * 32 + 1, 0, 32, REGION)).toBeNull();
    expect(tileAt(-1, 0, 32, REGION)).toBeNull();
  });
});

describe("keyDirection", () => {
  it("combines held keys into a direction", () => {
    expect(keyDirection({ up: true, down: false, left: false, right: true })).toEqual({
      x: 1,
      y: -1,
    });
    expect(keyDirection({ up: false, down: false, left: false, right: false })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("cancels opposite keys", () => {
    expect(keyDirection({ up: true, down: true, left: true, right: true })).toEqual({ x: 0, y: 0 });
  });
});

describe("shouldSend", () => {
  const base = {
    position: { x: 2, y: 2 },
    lastSent: { x: 1, y: 1 },
    lastSentAt: 1_000,
    now: 1_000 + SEND_INTERVAL_MS,
    inFlight: false,
    walking: true,
  };

  it("sends a changed position once the interval has passed", () => {
    expect(shouldSend(base)).toBe(true);
  });

  it("waits for the interval while walking", () => {
    expect(shouldSend({ ...base, now: base.lastSentAt + 100 })).toBe(false);
  });

  it("sends straight away when the character stops", () => {
    expect(shouldSend({ ...base, now: base.lastSentAt + 100, walking: false })).toBe(true);
  });

  it("never sends an unchanged position or overlaps requests", () => {
    expect(shouldSend({ ...base, position: base.lastSent })).toBe(false);
    expect(shouldSend({ ...base, inFlight: true })).toBe(false);
  });
});
