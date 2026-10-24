import { characters, type Db, type DbExecutor, gameActions } from "@nf/db";
import {
  type ActionFailure,
  type ActionRequest,
  applyAction,
  type CharacterState,
  type GameState,
  type RuleResult,
} from "@nf/shared";
import { and, eq } from "drizzle-orm";

export type ActionResult = RuleResult<GameState, ActionFailure>;

const characterColumns = {
  id: characters.id,
  name: characters.name,
  rank: characters.rank,
  gold: characters.gold,
  region: characters.region,
  x: characters.x,
  y: characters.y,
  movedAt: characters.movedAt,
};

/** Database row (timestamps as Date) to game state (timestamps as epoch milliseconds). */
function toCharacterState(row: {
  id: string;
  name: string;
  rank: string;
  gold: number;
  region: string;
  x: number;
  y: number;
  movedAt: Date;
}): CharacterState {
  return { ...row, movedAt: row.movedAt.getTime() };
}

export async function loadState(db: DbExecutor, characterId: string): Promise<GameState> {
  const [character] = await db
    .select(characterColumns)
    .from(characters)
    .where(eq(characters.id, characterId));
  if (!character) throw new Error(`Character ${characterId} not found`);
  return { character: toCharacterState(character) };
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

      const [character] = await tx
        .select(characterColumns)
        .from(characters)
        .where(eq(characters.id, characterId))
        .for("update");
      if (!character) throw new Error(`Character ${characterId} not found`);

      const result = applyAction({ character: toCharacterState(character) }, action, now.getTime());
      if (result.ok) await saveCharacter(tx, result.value.character);
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

async function saveCharacter(db: DbExecutor, character: CharacterState): Promise<void> {
  await db
    .update(characters)
    .set({
      rank: character.rank,
      gold: character.gold,
      region: character.region,
      x: character.x,
      y: character.y,
      movedAt: new Date(character.movedAt),
    })
    .where(eq(characters.id, character.id));
}
