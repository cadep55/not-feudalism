import {
  type CraftJob,
  type GatherJob,
  newField,
  RESOURCE_NODES,
  type ResourceNode,
  tileDistance,
} from "@nf/shared";
import { describe, expect, it } from "vitest";
import {
  JOB_SETTLE_MS,
  jobProgress,
  nearestAdjacentTile,
  nodeAt,
  nodesIn,
  readyToGather,
  refreshDelay,
  walkingCancels,
} from "./gathering.ts";

const REGION = { width: 25, height: 18 };
const TREE = RESOURCE_NODES.heartland_tree; // (5, 5)

function nodeOn(x: number, y: number): ResourceNode {
  return { region: "heartland", x, y, kind: "rock", yields: "stone", requires: null };
}

describe("nodesIn and nodeAt", () => {
  it("lists the region's nodes", () => {
    expect(nodesIn("heartland")).toEqual(["heartland_tree", "heartland_rock"]);
    expect(nodesIn("nowhere")).toEqual([]);
  });

  it("finds the node on a clicked tile, or null for plain ground", () => {
    expect(nodeAt({ x: 5, y: 5 }, "heartland")).toBe("heartland_tree");
    // The wheat field there is game state now, not a node (see fields.ts).
    expect(nodeAt({ x: 13, y: 14 }, "heartland")).toBeNull();
    expect(nodeAt({ x: 6, y: 5 }, "heartland")).toBeNull();
    expect(nodeAt({ x: 5, y: 5 }, "nowhere")).toBeNull();
  });
});

describe("nearestAdjacentTile", () => {
  it("stays put when already next to the node", () => {
    expect(nearestAdjacentTile({ x: 6, y: 6 }, TREE, REGION)).toEqual({ x: 6, y: 6 });
    expect(nearestAdjacentTile({ x: 4, y: 5 }, TREE, REGION)).toEqual({ x: 4, y: 5 });
  });

  it("steps off the node when standing on it", () => {
    expect(nearestAdjacentTile({ x: 5, y: 5 }, TREE, REGION)).toEqual({ x: 5, y: 4 });
  });

  it("always picks a tile at distance exactly 1 from the node", () => {
    for (let y = 0; y < REGION.height; y++) {
      for (let x = 0; x < REGION.width; x++) {
        const tile = nearestAdjacentTile({ x, y }, TREE, REGION);
        expect(tile && tileDistance(tile, TREE)).toBe(1);
      }
    }
  });

  it("picks the closest tile around the node", () => {
    expect(nearestAdjacentTile({ x: 10, y: 10 }, TREE, REGION)).toEqual({ x: 6, y: 6 });
    expect(nearestAdjacentTile({ x: 0, y: 5 }, TREE, REGION)).toEqual({ x: 4, y: 5 });
  });

  it("prefers the straighter approach when several tiles are equally far", () => {
    expect(nearestAdjacentTile({ x: 5, y: 0 }, TREE, REGION)).toEqual({ x: 5, y: 4 });
  });

  it("never picks a tile off the map", () => {
    expect(nearestAdjacentTile({ x: 5, y: 5 }, nodeOn(0, 0), REGION)).toEqual({ x: 1, y: 1 });
    expect(nearestAdjacentTile({ x: 0, y: 10 }, nodeOn(0, 0), REGION)).toEqual({ x: 0, y: 1 });
  });

  it("never picks a tile with another node on it", () => {
    // Next to the tree at (5, 5): the tree's tile would be the straightest approach.
    expect(nearestAdjacentTile({ x: 7, y: 5 }, nodeOn(4, 5), REGION)).toEqual({ x: 5, y: 4 });
  });

  it("returns null when every tile around the node is off the map", () => {
    expect(nearestAdjacentTile({ x: 3, y: 3 }, nodeOn(0, 0), { width: 1, height: 1 })).toBeNull();
  });
});

describe("jobProgress and refreshDelay", () => {
  const job: GatherJob = {
    kind: "gather",
    nodeId: "heartland_tree",
    startedAt: 1_000,
    completesAt: 4_000,
  };

  it("fills from start to completion and stays within 0..1", () => {
    expect(jobProgress(job, 1_000)).toBe(0);
    expect(jobProgress(job, 2_500)).toBe(0.5);
    expect(jobProgress(job, 4_000)).toBe(1);
    expect(jobProgress(job, 0)).toBe(0);
    expect(jobProgress(job, 9_000)).toBe(1);
  });

  it("treats a zero-length job as done", () => {
    expect(jobProgress({ ...job, completesAt: job.startedAt }, 0)).toBe(1);
  });

  it("waits until just after the job ends", () => {
    expect(refreshDelay(job, 1_000)).toBe(3_000 + JOB_SETTLE_MS);
    expect(refreshDelay(job, 10_000)).toBe(JOB_SETTLE_MS);
  });
});

describe("craft jobs", () => {
  const craft: CraftJob = { kind: "craft", recipeId: "rake", startedAt: 1_000, completesAt: 4_000 };

  it("fill and refresh on the same timestamps as gathers", () => {
    expect(jobProgress(craft, 2_500)).toBe(0.5);
    expect(refreshDelay(craft, 1_000)).toBe(3_000 + JOB_SETTLE_MS);
  });
});

describe("walkingCancels", () => {
  it("is true for a gather, which walking away ends", () => {
    expect(
      walkingCancels({ kind: "gather", nodeId: "heartland_tree", startedAt: 0, completesAt: 1 }),
    ).toBe(true);
  });

  it("is true for a harvest, which is tied to the field like a gather", () => {
    expect(
      walkingCancels({ kind: "harvest", fieldId: "heartland:13,14", startedAt: 0, completesAt: 1 }),
    ).toBe(true);
  });

  it("is false for a craft, which keeps going on the move", () => {
    expect(walkingCancels({ kind: "craft", recipeId: "rake", startedAt: 0, completesAt: 1 })).toBe(
      false,
    );
  });
});

describe("readyToGather", () => {
  const base = {
    position: { x: 6, y: 6 },
    lastSent: { x: 6, y: 6 },
    inFlight: false,
    stepping: false,
    node: TREE,
  };

  it("starts once standing next to the node and the server knows it", () => {
    expect(readyToGather(base)).toBe(true);
  });

  it("waits while walking or while the position is unacknowledged", () => {
    expect(readyToGather({ ...base, stepping: true })).toBe(false);
    expect(readyToGather({ ...base, inFlight: true })).toBe(false);
    expect(readyToGather({ ...base, lastSent: { x: 7, y: 7 } })).toBe(false);
  });

  it("waits until next to the node", () => {
    const far = { x: 9, y: 9 };
    expect(readyToGather({ ...base, position: far, lastSent: far })).toBe(false);
  });

  it("works for a wheat field the same way", () => {
    const field = newField("heartland", 13, 14, 0);
    const beside = { x: 12, y: 14 };
    expect(nearestAdjacentTile({ x: 10, y: 14 }, field, REGION)).toEqual(beside);
    expect(readyToGather({ ...base, position: beside, lastSent: beside, node: field })).toBe(true);
    const on = { x: 13, y: 14 };
    expect(readyToGather({ ...base, position: on, lastSent: on, node: field })).toBe(false);
  });

  it("never gathers while standing on the node", () => {
    const on = { x: TREE.x, y: TREE.y };
    expect(readyToGather({ ...base, position: on, lastSent: on })).toBe(false);
  });
});
