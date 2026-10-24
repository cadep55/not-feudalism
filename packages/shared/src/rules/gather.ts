import {
  GATHER_DURATION_MS,
  GATHER_YIELD,
  type NodeId,
  RESOURCE_NODES,
} from "../data/resources.ts";
import type { GameState, Inventory } from "../game/state.ts";
import { fail, ok, type RuleResult } from "../result.ts";
import { tileDistance } from "./move.ts";

export function addItems(inventory: Inventory, item: keyof Inventory, amount: number): Inventory {
  return { ...inventory, [item]: (inventory[item] ?? 0) + amount };
}

/**
 * Finishes the job if its time has come, adding what it produced. Called before
 * every action and when state is loaded, so jobs complete even while the player
 * is offline (lazy resolution; nothing ticks).
 */
export function resolveJob(state: GameState, now: number): GameState {
  const { job } = state;
  if (!job || job.completesAt > now) return state;
  const node = RESOURCE_NODES[job.nodeId];
  return { ...state, inventory: addItems(state.inventory, node.yields, GATHER_YIELD), job: null };
}

/** Starts gathering at a node next to the character. Expects a resolved state. */
export function startGather(
  state: GameState,
  nodeId: NodeId,
  now: number,
): RuleResult<GameState, "too_far_away" | "busy" | "missing_tool"> {
  const node = RESOURCE_NODES[nodeId];
  const { character } = state;
  if (node.region !== character.region || tileDistance(character, node) > 1) {
    return fail("too_far_away");
  }
  if (state.job) return fail("busy");
  if (node.requires && !state.inventory[node.requires]) return fail("missing_tool");
  return ok({
    ...state,
    job: { kind: "gather", nodeId, startedAt: now, completesAt: now + GATHER_DURATION_MS },
  });
}
