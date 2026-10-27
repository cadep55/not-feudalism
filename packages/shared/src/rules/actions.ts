import type { GameState } from "../game/state.ts";
import type { GameAction } from "../protocol/actions.ts";
import { ok, type RuleResult } from "../result.ts";
import { type BuildFailure, type RemoveFailure, startBuild, startRemove } from "./build.ts";
import { startCraft } from "./craft.ts";
import { plantSeed, startHarvest } from "./farming.ts";
import { startGather } from "./gather.ts";
import { resolveJob } from "./jobs.ts";
import { moveTo } from "./move.ts";
import { type StorehouseFailure, storeItems, takeItems } from "./storehouse.ts";
import { startTravel } from "./travel.ts";
import { assignVillager, settleVillagers } from "./villagers.ts";

/** Every reason a game rule may refuse an action. */
export type ActionFailure =
  | "out_of_bounds"
  | "moved_too_fast"
  | "water"
  | "not_at_travel_zone"
  | "too_far_away"
  | "not_facing"
  | "busy"
  | "missing_tool"
  | "missing_materials"
  | StorehouseFailure
  | "no_field"
  | "field_growing"
  | "no_seeds"
  | "cannot_plant_here"
  | "no_villager"
  | "no_rake_in_storehouse"
  | BuildFailure
  | RemoveFailure;

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
  const current = settleWorld(state, now);
  switch (action.type) {
    case "move.to": {
      const moved = moveTo(current.character, action.payload, now);
      if (!moved.ok) return moved;
      const stayed = moved.value.x === current.character.x && moved.value.y === current.character.y;
      // Walking away cancels an unfinished gather, harvest or trip; crafting carries on.
      const cancelled = !stayed && (isTiedToSpot(current) || current.job?.kind === "travel");
      return ok({ ...current, character: moved.value, job: cancelled ? null : current.job });
    }
    case "turn": {
      const { facing } = action.payload;
      // Turning away from the node cancels an unfinished gather, like walking away.
      const cancelled = facing !== current.character.facing && isTiedToSpot(current);
      return ok({
        ...current,
        character: { ...current.character, facing },
        job: cancelled ? null : current.job,
      });
    }
    case "gather.start":
      return startGather(current, action.payload.nodeId, now);
    case "field.harvest":
      return startHarvest(current, action.payload.fieldId, now);
    case "field.plant":
      return plantSeed(current, now);
    case "villager.assign":
      return assignVillager(current, action.payload.villagerId, action.payload.job, now);
    case "craft.start":
      return startCraft(current, action.payload.recipeId, now);
    case "storehouse.store":
      return storeItems(current, action.payload.item, action.payload.quantity);
    case "storehouse.take":
      return takeItems(current, action.payload.item, action.payload.quantity);
    case "building.build":
      return startBuild(current, action.payload.kind, action.payload.x, action.payload.y, now);
    case "building.remove":
      return startRemove(current, action.payload.buildingId, now);
    case "travel.start":
      return startTravel(current, now);
  }
}

/** Gathering and harvesting need the character to stay put, facing their target. */
function isTiedToSpot(state: GameState): boolean {
  return state.job?.kind === "gather" || state.job?.kind === "harvest";
}

/**
 * Brings a state up to `now`: finishes the character's job if it's due and
 * hands in villager deliveries. Done before every action and when state is read.
 */
export function settleWorld(state: GameState, now: number): GameState {
  return settleVillagers(resolveJob(state, now), now);
}
