import { type Db, type DbExecutor, gameActions } from "@nf/db";
import {
  type ActionFailure,
  type ActionRequest,
  applyAction,
  type GameState,
  type RuleResult,
  resolveJob,
} from "@nf/shared";
import { and, eq } from "drizzle-orm";
import { loadStateForUpdate, saveState } from "./state-store.ts";

export type ActionResult = RuleResult<GameState, ActionFailure>;

/**
 * The character's current state. Finished jobs are resolved and saved first
 * (lazy resolution), so a gather that completed while the player was away
 * shows up in their inventory.
 */
export async function readState(db: Db, characterId: string, now: Date): Promise<GameState> {
  return db.transaction(async (tx) => {
    const before = await loadStateForUpdate(tx, characterId);
    const after = resolveJob(before, now.getTime());
    if (after !== before) await saveState(tx, before, after, now);
    return after;
  });
}

async function storedResult(
  db: DbExecutor,
  characterId: string,
  requestId: string,
): Promise<ActionResult | undefined> {
  const [row] = await db
    .select({ result: gameActions.result })
    .from(gameActions)
    .where(and(eq(gameActions.characterId, characterId), eq(gameActions.requestId, requestId)));
  return row?.result as ActionResult | undefined;
}

function isUniqueViolation(err: unknown): boolean {
  const candidates = [err, (err as { cause?: unknown })?.cause];
  return candidates.some((e) => (e as { code?: string } | undefined)?.code === "23505");
}

/**
 * Applies one action exactly once (ADR 0002): load the state with the character
 * row locked, run the pure shared rule, save the new state and the result in
 * one transaction. A requestId seen before returns the stored result unchanged.
 */
export async function performAction(
  db: Db,
  characterId: string,
  request: ActionRequest,
  now: Date,
): Promise<ActionResult> {
  const { requestId, ...action } = request;
  try {
    return await db.transaction(async (tx) => {
      const previous = await storedResult(tx, characterId, requestId);
      if (previous) return previous;

      const before = await loadStateForUpdate(tx, characterId);
      const result = applyAction(before, action, now.getTime());
      if (result.ok) {
        await saveState(tx, before, result.value, now);
      } else {
        // A refused action still collects a gather that finished in the meantime.
        const resolved = resolveJob(before, now.getTime());
        if (resolved !== before) await saveState(tx, before, resolved, now);
      }
      await tx.insert(gameActions).values({
        characterId,
        requestId,
        type: action.type,
        payload: action.payload,
        result,
      });
      return result;
    });
  } catch (err) {
    // The same requestId arrived twice at once: the other request won, so return its result.
    if (isUniqueViolation(err)) {
      const winner = await storedResult(db, characterId, requestId);
      if (winner) return winner;
    }
    throw err;
  }
}
