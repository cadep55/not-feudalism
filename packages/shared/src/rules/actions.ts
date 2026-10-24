import type { GameState } from "../game/state.ts";
import type { GameAction } from "../protocol/actions.ts";
import { ok, type RuleResult } from "../result.ts";
import { moveTo } from "./move.ts";

/** Every reason a game rule may refuse an action. */
export type ActionFailure = "out_of_bounds" | "moved_too_fast";

/**
 * Applies one action to a game state. Pure: the server loads the state, calls
 * this with the current time, and saves the result; nothing here touches the
 * network, database or clock. `now` is milliseconds since the epoch.
 */
export function applyAction(
  state: GameState,
  action: GameAction,
  now: number,
): RuleResult<GameState, ActionFailure> {
  switch (action.type) {
    case "move.to": {
      const moved = moveTo(state.character, action.payload, now);
      return moved.ok ? ok({ ...state, character: moved.value }) : moved;
    }
  }
}
