import type { ItemId } from "./items.ts";
import type { RegionId } from "./world.ts";

// Gathering balance (owner decisions, 2026-10-24: one tree and one rock, never run out).
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

export const RESOURCE_NODES = {
  heartland_tree: { region: "heartland", x: 5, y: 5, kind: "tree", yields: "wood", requires: null },
  heartland_rock: {
    region: "heartland",
    x: 19,
    y: 4,
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
