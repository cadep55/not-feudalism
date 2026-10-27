import type { Building } from "../data/buildings.ts";
import type { ItemId } from "../data/items.ts";
import type { RecipeId } from "../data/recipes.ts";
import type { NodeId } from "../data/resources.ts";
import type { RegionId } from "../data/world.ts";
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
  /** The section the character stands in. */
  region: string;
  /** The section the character calls home: one per player (ADR 0004). They build and plant only here. */
  homeRegion: string;
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

/** Putting up a building; it appears when the job completes. Materials are paid at the start. */
export type BuildJob = {
  kind: "build";
  building: Building;
  startedAt: number;
  completesAt: number;
};

/**
 * Taking a building down. It's out of use (and the refund paid) from the
 * start; the job is the time it takes, and shows where it stood.
 */
export type RemoveJob = {
  kind: "remove";
  building: Building;
  startedAt: number;
  completesAt: number;
};

/** Travelling to the next section from a travel zone; the character arrives when it completes. */
export type TravelJob = {
  kind: "travel";
  to: RegionId;
  /** Where they arrive in the next section. */
  arrive: { x: number; y: number };
  startedAt: number;
  completesAt: number;
};

export type Job = GatherJob | HarvestJob | CraftJob | BuildJob | RemoveJob | TravelJob;

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

/** What the world view shows: who calls each section home, and where the player is. */
export type WorldOverview = {
  /** The player's home section. */
  home: string;
  /** The section the player stands in. */
  here: string;
  /** Each taken section's player, by section id. Sections nobody has are left out. */
  owners: Record<string, string>;
};

/** Another player's base, seen when standing in their section. Look, don't touch. */
export type OtherBase = {
  characterName: string;
  buildings: Building[];
  fields: Field[];
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
  /** Other players' bases in the section the character stands in (empty at home). */
  others: OtherBase[];
};
