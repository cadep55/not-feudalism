import type { ItemId } from "./items.ts";
import type { RegionId } from "./world.ts";

// Gathering balance (owner decisions, 2026-10-24: trees and rocks never run out).
// Wheat fields are not nodes: they run out and can be planted (data/farming.ts).

/** How long one gather takes. */
export const GATHER_DURATION_MS = 3_000;

/** Units of the node's item one gather yields. */
export const GATHER_YIELD = 1;

export type ResourceNode = {
  region: RegionId;
  x: number;
  y: number;
  /** What it looks like on the map. */
  kind: "tree" | "rock";
  yields: ItemId;
  /** A tool the character must carry to gather here, or null. */
  requires: ItemId | null;
};

// TODO(design): where each section's resources stand, and how many.
/** Every section has one tree and one rock (owner decision, 2026-10-25). */
export const RESOURCE_NODES = {
  northwest_tree: { region: "northwest", x: 5, y: 5, kind: "tree", yields: "wood", requires: null },
  northwest_rock: {
    region: "northwest",
    x: 19,
    y: 4,
    kind: "rock",
    yields: "stone",
    requires: null,
  },
  north_tree: { region: "north", x: 5, y: 5, kind: "tree", yields: "wood", requires: null },
  north_rock: { region: "north", x: 19, y: 4, kind: "rock", yields: "stone", requires: null },
  northeast_coast_tree: {
    region: "northeast_coast",
    x: 5,
    y: 5,
    kind: "tree",
    yields: "wood",
    requires: null,
  },
  northeast_coast_rock: {
    region: "northeast_coast",
    x: 12,
    y: 3,
    kind: "rock",
    yields: "stone",
    requires: null,
  },
  west_tree: { region: "west", x: 5, y: 5, kind: "tree", yields: "wood", requires: null },
  west_rock: { region: "west", x: 19, y: 4, kind: "rock", yields: "stone", requires: null },
  heartland_tree: { region: "heartland", x: 5, y: 5, kind: "tree", yields: "wood", requires: null },
  heartland_rock: {
    region: "heartland",
    x: 19,
    y: 4,
    kind: "rock",
    yields: "stone",
    requires: null,
  },
  east_coast_tree: {
    region: "east_coast",
    x: 5,
    y: 5,
    kind: "tree",
    yields: "wood",
    requires: null,
  },
  east_coast_rock: {
    region: "east_coast",
    x: 12,
    y: 3,
    kind: "rock",
    yields: "stone",
    requires: null,
  },
  south_tree: { region: "south", x: 5, y: 5, kind: "tree", yields: "wood", requires: null },
  south_rock: { region: "south", x: 19, y: 4, kind: "rock", yields: "stone", requires: null },
  southeast_coast_tree: {
    region: "southeast_coast",
    x: 5,
    y: 5,
    kind: "tree",
    yields: "wood",
    requires: null,
  },
  southeast_coast_rock: {
    region: "southeast_coast",
    x: 12,
    y: 3,
    kind: "rock",
    yields: "stone",
    requires: null,
  },
  north_isle_tree: {
    region: "north_isle",
    x: 6,
    y: 6,
    kind: "tree",
    yields: "wood",
    requires: null,
  },
  north_isle_rock: {
    region: "north_isle",
    x: 16,
    y: 5,
    kind: "rock",
    yields: "stone",
    requires: null,
  },
  south_isle_tree: {
    region: "south_isle",
    x: 6,
    y: 8,
    kind: "tree",
    yields: "wood",
    requires: null,
  },
  south_isle_rock: {
    region: "south_isle",
    x: 16,
    y: 10,
    kind: "rock",
    yields: "stone",
    requires: null,
  },
} as const satisfies Record<string, ResourceNode>;

export type NodeId = keyof typeof RESOURCE_NODES;

export const NODE_IDS = Object.keys(RESOURCE_NODES) as [NodeId, ...NodeId[]];

export function isNodeId(value: string): value is NodeId {
  return Object.hasOwn(RESOURCE_NODES, value);
}

/** The section's node that yields an item (e.g. its tree for wood), or null if it has none. */
export function nodeYielding(region: string, item: ItemId): NodeId | null {
  return (
    NODE_IDS.find(
      (id) => RESOURCE_NODES[id].region === region && RESOURCE_NODES[id].yields === item,
    ) ?? null
  );
}
