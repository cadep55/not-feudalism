import { describe, expect, it } from "vitest";
import {
  type Building,
  STARTING_BUILDINGS,
  STARTING_HOUSE,
  STARTING_STOREHOUSE,
} from "../data/buildings.ts";
import { RESOURCE_NODES } from "../data/resources.ts";
import type { Direction } from "../game/direction.ts";
import type { GameState } from "../game/state.ts";
import {
  buildingAt,
  buildingById,
  buildingsOf,
  distanceToBuilding,
  houseDoor,
  isBlocked,
  storehouseInFront,
  storehousesByDistance,
} from "./buildings.ts";

const store = STARTING_STOREHOUSE; // (15, 8), 2x2
/** A second storehouse in the top-left corner, near the tree. */
const NORTH: Building = { ...store, id: "north_storehouse", x: 2, y: 1 };
const buildings = [...STARTING_BUILDINGS, NORTH];

function state(x: number, y: number, facing: Direction): GameState {
  return {
    character: {
      id: "c1",
      name: "Alice",
      rank: "peasant",
      gold: 0,
      region: "heartland",
      x,
      y,
      movedAt: 0,
      facing,
    },
    inventory: {},
    storage: {},
    buildings,
    fields: [],
    villagers: [],
    job: null,
  };
}

describe("finding buildings", () => {
  it("lists buildings by kind, finds them by id and by any tile they cover", () => {
    const s = state(10, 10, "s");
    expect(buildingsOf(s, "storehouse")).toEqual([store, NORTH]);
    expect(buildingsOf(s, "house")).toEqual([STARTING_HOUSE]);
    expect(buildingById(s, NORTH.id)).toBe(NORTH);
    expect(buildingById(s, "nope")).toBeNull();
    expect(buildingAt(buildings, "heartland", { x: 3, y: 2 })).toBe(NORTH);
    expect(buildingAt(buildings, "heartland", { x: 4, y: 2 })).toBeNull();
    expect(buildingAt(buildings, "elsewhere", { x: 3, y: 2 })).toBeNull();
  });

  it("measures steps to the nearest footprint tile", () => {
    expect(distanceToBuilding({ x: 14, y: 8 }, store)).toBe(1);
    expect(distanceToBuilding({ x: 16, y: 9 }, store)).toBe(0);
    expect(distanceToBuilding({ x: 20, y: 9 }, store)).toBe(4);
  });

  it("finds the storehouse the character stands beside and faces", () => {
    expect(storehouseInFront(state(store.x - 1, store.y, "e"))).toBe(store);
    expect(storehouseInFront(state(NORTH.x + 2, NORTH.y, "w"))).toBe(NORTH);
    expect(storehouseInFront(state(store.x - 1, store.y, "w"))).toBeNull();
    expect(storehouseInFront(state(store.x, store.y, "e"))).toBeNull();
  });

  it("orders storehouses nearest first, ties in build order", () => {
    const tree = RESOURCE_NODES.heartland_tree;
    expect(storehousesByDistance(buildings, "heartland", tree)).toEqual([NORTH, store]);
    expect(storehousesByDistance(buildings, "heartland", { x: 16, y: 7 })).toEqual([store, NORTH]);
    const twin = { ...store, id: "twin" };
    expect(storehousesByDistance([twin, store], "heartland", { x: 0, y: 0 })).toEqual([
      twin,
      store,
    ]);
    expect(storehousesByDistance(buildings, "elsewhere", tree)).toEqual([]);
  });
});

describe("blocked tiles", () => {
  it("blocks off the map, buildings and resource nodes, but not grass", () => {
    const rock = RESOURCE_NODES.heartland_rock;
    expect(isBlocked(buildings, "heartland", { x: -1, y: 0 })).toBe(true);
    expect(isBlocked(buildings, "heartland", { x: 25, y: 0 })).toBe(true);
    expect(isBlocked(buildings, "heartland", { x: 0, y: 18 })).toBe(true);
    expect(isBlocked(buildings, "heartland", { x: store.x, y: store.y })).toBe(true);
    expect(isBlocked(buildings, "heartland", rock)).toBe(true);
    expect(isBlocked(buildings, "heartland", { x: 10, y: 10 })).toBe(false);
    expect(isBlocked(buildings, "nowhere", { x: 10, y: 10 })).toBe(true);
  });

  it("puts a house's door just below it", () => {
    expect(houseDoor(STARTING_HOUSE)).toEqual({ x: 5, y: 14 });
  });
});
