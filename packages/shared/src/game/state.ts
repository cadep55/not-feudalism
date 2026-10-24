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

export type CraftJob = {
  kind: "craft";
  recipeId: RecipeId;
  startedAt: number;
  completesAt: number;
};

export type Job = GatherJob | CraftJob;

export type GameState = {
  character: CharacterState;
  /** What the character carries (at most CARRY_LIMIT of each). */
  inventory: Inventory;
  /** What the character's storehouse holds (at most STOREHOUSE_LIMIT of each). */
  storage: Inventory;
  /** The character's job in progress, or null when idle. */
  job: Job | null;
};
