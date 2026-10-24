import { DIRECTION_VECTORS, DIRECTIONS, type Direction, RESOURCE_NODES } from "@nf/shared";
import { describe, expect, it } from "vitest";
import { arrowPlacement, facingAfterStep, turnBeforeGather } from "./facing.ts";

const TREE = RESOURCE_NODES.heartland_tree; // (5, 5)

describe("facingAfterStep", () => {
  it.each(DIRECTIONS)("faces %s after stepping that way", (direction) => {
    const from = { x: 10, y: 10 };
    const step = DIRECTION_VECTORS[direction];
    const to = { x: from.x + step.x, y: from.y + step.y };
    // Start facing the opposite way so the change is visible.
    expect(facingAfterStep(from, to, direction === "s" ? "n" : "s")).toBe(direction);
  });

  it("keeps the current facing when the step goes nowhere", () => {
    expect(facingAfterStep({ x: 3, y: 3 }, { x: 3, y: 3 }, "ne")).toBe("ne");
  });
});

describe("turnBeforeGather", () => {
  it("needs no turn when already facing the node", () => {
    expect(turnBeforeGather({ x: 5, y: 6 }, TREE, "n")).toBeNull();
    expect(turnBeforeGather({ x: 6, y: 6 }, TREE, "nw")).toBeNull();
  });

  it("turns toward the node from every side", () => {
    const expected: Record<Direction, Direction> = {
      n: "s",
      ne: "sw",
      e: "w",
      se: "nw",
      s: "n",
      sw: "ne",
      w: "e",
      nw: "se",
    };
    for (const side of DIRECTIONS) {
      const step = DIRECTION_VECTORS[side];
      const standing = { x: TREE.x + step.x, y: TREE.y + step.y };
      // Facing the way we came (away from the node) always needs a turn.
      expect(turnBeforeGather(standing, TREE, side)).toBe(expected[side]);
    }
  });

  it("turns when the server's facing is unknown", () => {
    expect(turnBeforeGather({ x: 4, y: 5 }, TREE, null)).toBe("e");
  });

  it("can't fix standing on the node by turning", () => {
    expect(turnBeforeGather({ x: 5, y: 5 }, TREE, "s")).toBeNull();
  });
});

describe("arrowPlacement", () => {
  const angles: Record<Direction, number> = {
    e: 0,
    se: Math.PI / 4,
    s: Math.PI / 2,
    sw: (3 * Math.PI) / 4,
    w: Math.PI,
    nw: (-3 * Math.PI) / 4,
    n: -Math.PI / 2,
    ne: -Math.PI / 4,
  };

  it.each(DIRECTIONS)("points %s", (direction) => {
    expect(arrowPlacement(direction, 16).angle).toBeCloseTo(angles[direction]);
  });

  it("sits at the tile edge in the facing direction", () => {
    expect(arrowPlacement("n", 16)).toMatchObject({ x: 0, y: -16 });
    expect(arrowPlacement("e", 16)).toMatchObject({ x: 16, y: 0 });
    expect(arrowPlacement("sw", 16)).toMatchObject({ x: -16, y: 16 });
  });

  it("gives all 8 directions different angles", () => {
    const distinct = new Set(DIRECTIONS.map((d) => arrowPlacement(d, 1).angle.toFixed(6)));
    expect(distinct.size).toBe(8);
  });
});
