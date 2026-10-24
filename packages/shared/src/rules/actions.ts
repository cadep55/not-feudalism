import type { GameState } from "../game/state.ts";
import type { GameAction } from "../protocol/actions.ts";
import { ok, type RuleResult } from "../result.ts";
import { startCraft } from "./craft.ts";
import { startGather } from "./gather.ts";
import { resolveJob } from "./jobs.ts";
import { moveTo } from "./move.ts";
import { type StorehouseFailure, storeItems, takeItems } from "./storehouse.ts";

/** Every reason a game rule may refuse an action. */
export type ActionFailure =
  | "out_of_bounds"
  | "moved_too_fast"
  | "too_far_away"
  | "not_facing"
  | "busy"
  | "missing_tool"
  | "missing_materials"
  | StorehouseFailure;

/**
 * Applies one action to a game state. Pure: the server loads the state, calls
 * this with the current time, and saves the result; nothing here touches the
 * network, database or clock. `now` is milliseconds since the epoch.
 * Finished jobs are resolved first, so their results count before the action.
 */
export function applyAction(
  state: GameState,
  action: GameAction,
  now: number,
): RuleResult<GameState, ActionFailure> {
  const current = resolveJob(state, now);
  switch (action.type) {
    case "move.to": {
      const moved = moveTo(current.character, action.payload, now);
      if (!moved.ok) return moved;
      const stayed = moved.value.x === current.character.x && moved.value.y === current.character.y;
      // Walking away from a node cancels an unfinished gather; crafting carries on.
      const cancelled = !stayed && current.job?.kind === "gather";
      return ok({ ...current, character: moved.value, job: cancelled ? null : current.job });
    }
    case "turn": {
      const { facing } = action.payload;
      // Turning away from the node cancels an unfinished gather, like walking away.
      const cancelled = facing !== current.character.facing && current.job?.kind === "gather";
      return ok({
        ...current,
        character: { ...current.character, facing },
        job: cancelled ? null : current.job,
      });
    }
    case "gather.start":
      return startGather(current, action.payload.nodeId, now);
    case "craft.start":
      return startCraft(current, action.payload.recipeId, now);
    case "storehouse.store":
      return storeItems(current, action.payload.item, action.payload.quantity);
    case "storehouse.take":
      return takeItems(current, action.payload.item, action.payload.quantity);
  }
}
