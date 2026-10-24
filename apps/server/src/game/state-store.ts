import { characters, type DbExecutor, inventories, jobs } from "@nf/db";
import {
  type GameState,
  type Inventory,
  ITEM_IDS,
  isItemId,
  isNodeId,
  isRecipeId,
  type Job,
} from "@nf/shared";
import { and, eq, isNull } from "drizzle-orm";

// Moves game state between Postgres rows and the plain objects the shared rules use.
// Timestamps are Date in the database and epoch milliseconds in game state.

/**
 * Loads a character's whole game state. Locks the character row, so call it
 * inside a transaction to make the following save safe from concurrent actions.
 */
export async function loadStateForUpdate(db: DbExecutor, characterId: string): Promise<GameState> {
  const [row] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .for("update");
  if (!row) throw new Error(`Character ${characterId} not found`);

  const items = await db
    .select({ itemId: inventories.itemId, quantity: inventories.quantity })
    .from(inventories)
    .where(eq(inventories.characterId, characterId));
  const inventory: Inventory = {};
  for (const { itemId, quantity } of items) {
    if (isItemId(itemId)) inventory[itemId] = quantity;
  }

  const [active] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.characterId, characterId), isNull(jobs.resolvedAt)));

  return {
    character: {
      id: row.id,
      name: row.name,
      rank: row.rank,
      gold: row.gold,
      region: row.region,
      x: row.x,
      y: row.y,
      movedAt: row.movedAt.getTime(),
    },
    inventory,
    job: active ? toJob(active) : null,
  };
}

function toJob(row: typeof jobs.$inferSelect): Job {
  const payload = row.payload as { nodeId?: unknown; recipeId?: unknown };
  const times = { startedAt: row.startedAt.getTime(), completesAt: row.completesAt.getTime() };
  if (row.kind === "gather" && typeof payload.nodeId === "string" && isNodeId(payload.nodeId)) {
    return { kind: "gather", nodeId: payload.nodeId, ...times };
  }
  if (
    row.kind === "craft" &&
    typeof payload.recipeId === "string" &&
    isRecipeId(payload.recipeId)
  ) {
    return { kind: "craft", recipeId: payload.recipeId, ...times };
  }
  throw new Error(`Job ${row.id} has an unknown kind or payload`);
}

/** What a job stores in its payload column, besides kind and times. */
function jobPayload(job: Job): Record<string, string> {
  switch (job.kind) {
    case "gather":
      return { nodeId: job.nodeId };
    case "craft":
      return { recipeId: job.recipeId };
  }
}

/** Writes whatever differs between `before` and `after`. */
export async function saveState(
  db: DbExecutor,
  before: GameState,
  after: GameState,
  now: Date,
): Promise<void> {
  const characterId = after.character.id;
  if (JSON.stringify(before.character) !== JSON.stringify(after.character)) {
    await db
      .update(characters)
      .set({
        rank: after.character.rank,
        gold: after.character.gold,
        region: after.character.region,
        x: after.character.x,
        y: after.character.y,
        movedAt: new Date(after.character.movedAt),
      })
      .where(eq(characters.id, characterId));
  }

  for (const itemId of ITEM_IDS) {
    const quantity = after.inventory[itemId] ?? 0;
    if (quantity === (before.inventory[itemId] ?? 0)) continue;
    if (quantity > 0) {
      await db
        .insert(inventories)
        .values({ characterId, itemId, quantity })
        .onConflictDoUpdate({
          target: [inventories.characterId, inventories.itemId],
          set: { quantity, updatedAt: now },
        });
    } else {
      await db
        .delete(inventories)
        .where(and(eq(inventories.characterId, characterId), eq(inventories.itemId, itemId)));
    }
  }

  const jobChanged = JSON.stringify(before.job) !== JSON.stringify(after.job);
  if (jobChanged && before.job) {
    // The old job ended: it finished if its time had come, otherwise it was cancelled.
    const outcome = before.job.completesAt <= now.getTime() ? "completed" : "cancelled";
    await db
      .update(jobs)
      .set({ resolvedAt: now, outcome })
      .where(and(eq(jobs.characterId, characterId), isNull(jobs.resolvedAt)));
  }
  if (jobChanged && after.job) {
    await db.insert(jobs).values({
      characterId,
      kind: after.job.kind,
      payload: jobPayload(after.job),
      startedAt: new Date(after.job.startedAt),
      completesAt: new Date(after.job.completesAt),
    });
  }
}
