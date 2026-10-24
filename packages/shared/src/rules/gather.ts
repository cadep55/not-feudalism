import { GATHER_DURATION_MS, type NodeId, RESOURCE_NODES } from "../data/resources.ts";
import type { GameState } from "../game/state.ts";
import { fail, ok, type RuleResult } from "../result.ts";
import { tileDistance } from "./move.ts";

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
