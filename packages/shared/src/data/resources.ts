import type { ItemId } from "./items.ts";
import type { RegionId } from "./world.ts";

// Gathering balance (owner decisions, 2026-10-24: one node of each, never runs out).

/** How long one gather takes. */
export const GATHER_DURATION_MS = 3_000;

/** Units of the node's item one gather yields. */
export const GATHER_YIELD = 1;

export type ResourceNode = {
  region: RegionId;
  x: number;
  y: number;
  /** What it looks like on the map. */
  kind: "tree" | "rock" | "farm";
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
  heartland_farm: {
    region: "heartland",
    x: 13,
    y: 14,
    kind: "farm",
    yields: "wheat",
    requires: "rake",
  },
} as const satisfies Record<string, ResourceNode>;

export type NodeId = keyof typeof RESOURCE_NODES;

export const NODE_IDS = Object.keys(RESOURCE_NODES) as [NodeId, ...NodeId[]];

export function isNodeId(value: string): value is NodeId {
  return Object.hasOwn(RESOURCE_NODES, value);
}
