// World layout data. Game rules and the server read these instead of hard-coding them.

/** Map size of each region, in tiles. Coordinates run from 0 to width-1 / height-1. */
export const REGIONS = {
  heartland: { width: 25, height: 18 },
} as const satisfies Record<string, { width: number; height: number }>;

export type RegionId = keyof typeof REGIONS;

export function isRegionId(value: string): value is RegionId {
  return Object.hasOwn(REGIONS, value);
}

// TODO(design): starting region name and spawn point for new characters.
export const STARTING_REGION: RegionId = "heartland";
export const SPAWN_POINT = { x: 10, y: 10 } as const;
