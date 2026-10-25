import type { RegionId } from "./world.ts";

// Farming balance (owner decisions, 2026-10-24).

/** Wheat a fully grown field holds. One harvest takes one. */
export const FIELD_WHEAT = 50;

/** Seeds a fully grown field holds; one drops every SEED_EVERY harvests. */
export const FIELD_SEEDS = 5;

/** Every this-many harvests from a field also yields a wheat seed (50 / 10 = 5 seeds). */
export const SEED_EVERY = 10;

/** How long a planted field grows before it can be harvested. */
export const FIELD_GROW_MS = 5 * 60 * 1000;

/** How long one harvest takes (same as gathering). */
export const HARVEST_DURATION_MS = 3_000;

/** Fields every new world starts with, already grown. */
export const STARTING_FIELDS: readonly { region: RegionId; x: number; y: number }[] = [
  { region: "heartland", x: 13, y: 14 },
];
