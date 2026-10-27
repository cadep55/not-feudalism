// World layout data (owner decisions, 2026-10-25/26, issue #47; ADR 0004).
// Game rules and the server read these instead of hard-coding them.

/** A rectangle of tiles: top-left corner and size. */
export type Rect = { x: number; y: number; width: number; height: number };

/** Every section is the same size, in tiles. Coordinates run from 0 to width-1 / height-1. */
export const SECTION_SIZE = { width: 25, height: 18 } as const;

export type Section = {
  /** Shown on the world view. */
  name: string;
  width: number;
  height: number;
  /** Where the section sits on the world grid (column, row). */
  col: number;
  row: number;
  /** Tiles nobody can walk on until boats exist (#48). */
  water: readonly Rect[];
  /** Whether players can walk here now (the island needs boats). New players only get these. */
  reachable: boolean;
};

const size = SECTION_SIZE;
/**
 * The east coast sections: the four eastern columns are sea. Narrow enough
 * that every reachable section has room for the same starting base and the
 * tree and rock in the same spots, wherever a new player lands.
 */
const EAST_SEA: readonly Rect[] = [{ x: 21, y: 0, width: 4, height: 18 }];

// TODO(design): section names, and the exact shapes of the coast and the island.
/**
 * The world grid (issue #47):
 *
 *   [northwest] [north] [northeast_coast~]
 *   [west]  [heartland] [east_coast~]        [north_isle]
 *           [south]     [southeast_coast~]   [south_isle]
 *
 * `~` sections are partly water. The two isle sections are water on three
 * sides and joined to each other by land.
 */
export const REGIONS = {
  northwest: { name: "Northwest", ...size, col: 0, row: 0, water: [], reachable: true },
  north: { name: "North", ...size, col: 1, row: 0, water: [], reachable: true },
  northeast_coast: {
    name: "Northeast Coast",
    ...size,
    col: 2,
    row: 0,
    water: EAST_SEA,
    reachable: true,
  },
  west: { name: "West", ...size, col: 0, row: 1, water: [], reachable: true },
  heartland: { name: "Heartland", ...size, col: 1, row: 1, water: [], reachable: true },
  east_coast: { name: "East Coast", ...size, col: 2, row: 1, water: EAST_SEA, reachable: true },
  south: { name: "South", ...size, col: 1, row: 2, water: [], reachable: true },
  southeast_coast: {
    name: "Southeast Coast",
    ...size,
    col: 2,
    row: 2,
    water: EAST_SEA,
    reachable: true,
  },
  north_isle: {
    name: "North Isle",
    ...size,
    col: 3,
    row: 1,
    // Sea to the north, west and east; land to the south, joining the south isle.
    water: [
      { x: 0, y: 0, width: 25, height: 3 },
      { x: 0, y: 3, width: 3, height: 15 },
      { x: 22, y: 3, width: 3, height: 15 },
    ],
    reachable: false,
  },
  south_isle: {
    name: "South Isle",
    ...size,
    col: 3,
    row: 2,
    // Sea to the south, west and east; land to the north, joining the north isle.
    water: [
      { x: 0, y: 15, width: 25, height: 3 },
      { x: 0, y: 0, width: 3, height: 15 },
      { x: 22, y: 0, width: 3, height: 15 },
    ],
    reachable: false,
  },
} as const satisfies Record<string, Section>;

export type RegionId = keyof typeof REGIONS;

export const REGION_IDS = Object.keys(REGIONS) as [RegionId, ...RegionId[]];

export function isRegionId(value: string): value is RegionId {
  return Object.hasOwn(REGIONS, value);
}

/** Pairs of sections joined by land, where players can travel between them. */
export const CONNECTIONS: readonly (readonly [RegionId, RegionId])[] = [
  ["northwest", "north"],
  ["northwest", "west"],
  ["north", "heartland"],
  ["north", "northeast_coast"],
  ["west", "heartland"],
  ["heartland", "east_coast"],
  ["heartland", "south"],
  ["south", "southeast_coast"],
  ["northeast_coast", "east_coast"],
  ["east_coast", "southeast_coast"],
  ["north_isle", "south_isle"],
];

/** How many tiles wide a travel zone is, in the middle of the shared edge. */
export const TRAVEL_ZONE_TILES = 3;

export type Side = "n" | "e" | "s" | "w";

/** Where a section can be left for a neighbour: a strip of tiles along one edge. */
export type TravelZone = { from: RegionId; to: RegionId; side: Side; tiles: Rect };

function sideToward(from: RegionId, to: RegionId): Side {
  const a = REGIONS[from];
  const b = REGIONS[to];
  if (b.col === a.col + 1 && b.row === a.row) return "e";
  if (b.col === a.col - 1 && b.row === a.row) return "w";
  if (b.row === a.row + 1 && b.col === a.col) return "s";
  if (b.row === a.row - 1 && b.col === a.col) return "n";
  throw new Error(`${from} and ${to} aren't next to each other`);
}

/** The strip of tiles in the middle of one edge of a section. */
function edgeStrip(region: RegionId, side: Side): Rect {
  const { width, height } = REGIONS[region];
  const across = Math.floor((width - TRAVEL_ZONE_TILES) / 2);
  const down = Math.floor((height - TRAVEL_ZONE_TILES) / 2);
  switch (side) {
    case "n":
      return { x: across, y: 0, width: TRAVEL_ZONE_TILES, height: 1 };
    case "s":
      return { x: across, y: height - 1, width: TRAVEL_ZONE_TILES, height: 1 };
    case "w":
      return { x: 0, y: down, width: 1, height: TRAVEL_ZONE_TILES };
    case "e":
      return { x: width - 1, y: down, width: 1, height: TRAVEL_ZONE_TILES };
  }
}

/** The ways out of a section, one per connection. */
export function travelZonesIn(region: string): TravelZone[] {
  if (!isRegionId(region)) return [];
  return CONNECTIONS.flatMap(([a, b]) => {
    const to = a === region ? b : b === region ? a : null;
    if (!to) return [];
    const side = sideToward(region, to);
    return [{ from: region, to, side, tiles: edgeStrip(region, side) }];
  });
}

export function inRect(rect: Rect, tile: { x: number; y: number }): boolean {
  return (
    tile.x >= rect.x &&
    tile.x < rect.x + rect.width &&
    tile.y >= rect.y &&
    tile.y < rect.y + rect.height
  );
}

/** Whether a tile is water. Off the map, or in an unknown region, counts as not water. */
export function isWater(region: string, tile: { x: number; y: number }): boolean {
  if (!isRegionId(region)) return false;
  return REGIONS[region].water.some((rect) => inRect(rect, tile));
}

/**
 * Sections a new player can be given: reachable ones nobody calls home yet
 * (one player per section, ADR 0004). Empty when the world is full.
 */
export function openSections(taken: readonly (string | null)[]): RegionId[] {
  return REGION_IDS.filter((id) => REGIONS[id].reachable && !taken.includes(id));
}

/** The section the first player of a world started in, before sections were shared. */
export const STARTING_REGION: RegionId = "heartland";
/** Where a new player stands in their home section. */
export const SPAWN_POINT = { x: 10, y: 10 } as const;
