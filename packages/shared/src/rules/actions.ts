import type { GameState } from "../game/state.ts";
import type { GameAction } from "../protocol/actions.ts";
import { ok, type RuleResult } from "../result.ts";
import { resolveJob, startGather } from "./gather.ts";
import { moveTo } from "./move.ts";

/** Every reason a game rule may refuse an action. */
export type ActionFailure =
  | "out_of_bounds"
  | "moved_too_fast"
  | "too_far_away"
  | "busy"
  | "missing_tool";

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
      // Walking away from a node cancels an unfinished gather.
      return ok({ ...current, character: moved.value, job: stayed ? current.job : null });
    }
    case "gather.start":
      return startGather(current, action.payload.nodeId, now);
  }
}
