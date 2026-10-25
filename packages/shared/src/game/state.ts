import type { Building } from "../data/buildings.ts";
import type { ItemId } from "../data/items.ts";
import type { RecipeId } from "../data/recipes.ts";
import type { NodeId } from "../data/resources.ts";
import type { Direction } from "./direction.ts";

/**
 * Everything the client needs to draw a character's game. The server is the
 * source of truth; the client only ever receives this, never sends it.
 */
export type CharacterState = {
  id: string;
  name: string;
  rank: string;
  /** Smallest coin unit; always an integer. */
  gold: number;
  region: string;
  x: number;
  y: number;
  /** When the character last moved, in milliseconds since the epoch. Used for speed checks. */
  movedAt: number;
  /** Which way the character faces: set by its last step or a turn. */
  facing: Direction;
};

/** Item counts. Items the character has none of are left out. */
export type Inventory = Partial<Record<ItemId, number>>;

/** A timed action in progress (golden rule 5: timestamps, no ticking). Times are epoch ms. */
export type GatherJob = {
  kind: "gather";
  nodeId: NodeId;
  startedAt: number;
  completesAt: number;
};

export type HarvestJob = {
  kind: "harvest";
  /** The field's id (see fieldId()). */
  fieldId: string;
  startedAt: number;
  completesAt: number;
};

export type CraftJob = {
  kind: "craft";
  recipeId: RecipeId;
  startedAt: number;
  completesAt: number;
};

export type Job = GatherJob | HarvestJob | CraftJob;

/**
 * A wheat field in the character's world. Fields run out and new ones can be
 * planted, so unlike tree and rock nodes they live in game state.
 */
export type Field = {
  /** One field per tile, so the id is derived from where it is (see fieldId()). */
  id: string;
  region: string;
  x: number;
  y: number;
  wheat: number;
  seeds: number;
  /** Harvests taken so far; every SEED_EVERY-th also yields a seed. */
  harvests: number;
  /** When it can first be harvested (epoch ms); planted fields grow until then. */
  readyAt: number;
};

/**
 * What a working villager is doing, and since when. Its whole work timeline
 * follows from this (docs/design/villagers.md); nothing ticks.
 */
export type VillagerTask = (
  | { kind: "gather"; nodeId: NodeId }
  | { kind: "harvest"; fieldId: string }
) & {
  /** The storehouse it walks to with each load (the nearest to its work when assigned). */
  storehouseId: string;
  since: number;
  delivered: number;
};

export type Villager = {
  id: string;
  name: string;
  /** The house it lives in and sets out from. */
  houseId: string;
  /** null while idle (wandering near the house). */
  task: VillagerTask | null;
};

export type GameState = {
  character: CharacterState;
  /** What the character carries (at most CARRY_LIMIT of each). */
  inventory: Inventory;
  /** The character's buildings: houses and storehouses. */
  buildings: Building[];
  /**
   * What each storehouse holds, by building id (at most STOREHOUSE_LIMIT of
   * each item per storehouse). Every storehouse has an entry, empty or not.
   */
  storage: Record<string, Inventory>;
  /** Wheat fields in the character's world. */
  fields: Field[];
  /** The villagers living in the character's houses. */
  villagers: Villager[];
  /** The character's job in progress, or null when idle. */
  job: Job | null;
};
