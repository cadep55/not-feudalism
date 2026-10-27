import { RECIPES } from "../data/recipes.ts";
import { GATHER_YIELD, RESOURCE_NODES } from "../data/resources.ts";
import type { GameState } from "../game/state.ts";
import { completeBuild } from "./build.ts";
import { completeHarvest } from "./farming.ts";
import { addItems } from "./inventory.ts";
import { completeTravel } from "./travel.ts";

/**
 * Finishes the job if its time has come, adding what it produced. Called before
 * every action and when state is loaded, so jobs complete even while the player
 * is offline (lazy resolution; nothing ticks).
 */
export function resolveJob(state: GameState, now: number): GameState {
  const { job } = state;
  if (!job || job.completesAt > now) return state;
  switch (job.kind) {
    case "gather": {
      const node = RESOURCE_NODES[job.nodeId];
      return {
        ...state,
        inventory: addItems(state.inventory, node.yields, GATHER_YIELD),
        job: null,
      };
    }
    case "harvest":
      return { ...completeHarvest(state, job.fieldId), job: null };
    case "craft": {
      const { output } = RECIPES[job.recipeId];
      return {
        ...state,
        inventory: addItems(state.inventory, output.item, output.quantity),
        job: null,
      };
    }
    case "build":
      return { ...completeBuild(state, job.building), job: null };
    case "remove":
      // The building came down when the job started; finishing just frees the character.
      return { ...state, job: null };
    case "travel":
      return { ...completeTravel(state, job.to, job.arrive, job.completesAt), job: null };
  }
}
