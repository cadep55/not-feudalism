import { characters, type DbExecutor, fields, inventories, jobs, storehouseItems } from "@nf/db";
import {
  DEFAULT_FACING,
  type Field,
  type GameState,
  type Inventory,
  ITEM_IDS,
  isDirection,
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

  const inventory = await loadItems(db, inventories, characterId);
  const storage = await loadItems(db, storehouseItems, characterId);
  const fieldRows = await db.select().from(fields).where(eq(fields.characterId, characterId));

  const [active] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.characterId, characterId), isNull(jobs.resolvedAt)));
  let job = active ? toJob(active) : null;
  if (active && !job) {
    // A job this version can't read (e.g. saved by older code) must not lock the
    // player out of their game forever: set it aside and carry on idle.
    await db
      .update(jobs)
      .set({ resolvedAt: new Date(), outcome: "invalid" })
      .where(eq(jobs.id, active.id));
    job = null;
  }

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
      facing: isDirection(row.facing) ? row.facing : DEFAULT_FACING,
    },
    inventory,
    storage,
    fields: fieldRows.map(toField),
    job,
  };
}

function toField(row: typeof fields.$inferSelect): Field {
  return {
    id: row.fieldId,
    region: row.region,
    x: row.x,
    y: row.y,
    wheat: row.wheat,
    seeds: row.seeds,
    harvests: row.harvests,
    readyAt: row.readyAt.getTime(),
  };
}

/** Inserts new fields, updates changed ones, deletes fields that are gone. */
async function saveFields(
  db: DbExecutor,
  characterId: string,
  before: Field[],
  after: Field[],
  now: Date,
): Promise<void> {
  const previous = new Map(before.map((f) => [f.id, f]));
  const current = new Set(after.map((f) => f.id));
  for (const field of after) {
    const old = previous.get(field.id);
    if (old && JSON.stringify(old) === JSON.stringify(field)) continue;
    const values = {
      region: field.region,
      x: field.x,
      y: field.y,
      wheat: field.wheat,
      seeds: field.seeds,
      harvests: field.harvests,
      readyAt: new Date(field.readyAt),
    };
    await db
      .insert(fields)
      .values({ characterId, fieldId: field.id, ...values })
      .onConflictDoUpdate({
        target: [fields.characterId, fields.fieldId],
        set: { ...values, updatedAt: now },
      });
  }
  for (const field of before) {
    if (current.has(field.id)) continue;
    await db
      .delete(fields)
      .where(and(eq(fields.characterId, characterId), eq(fields.fieldId, field.id)));
  }
}

/** The two item-count tables: what a character carries, and what its storehouse holds. */
type ItemTable = typeof inventories | typeof storehouseItems;

async function loadItems(
  db: DbExecutor,
  table: ItemTable,
  characterId: string,
): Promise<Inventory> {
  const rows = await db
    .select({ itemId: table.itemId, quantity: table.quantity })
    .from(table)
    .where(eq(table.characterId, characterId));
  const items: Inventory = {};
  for (const { itemId, quantity } of rows) {
    if (isItemId(itemId)) items[itemId] = quantity;
  }
  return items;
}

/** Writes changed counts; rows exist only while a count is above zero. */
async function saveItems(
  db: DbExecutor,
  table: ItemTable,
  characterId: string,
  before: Inventory,
  after: Inventory,
  now: Date,
): Promise<void> {
  for (const itemId of ITEM_IDS) {
    const quantity = after[itemId] ?? 0;
    if (quantity === (before[itemId] ?? 0)) continue;
    if (quantity > 0) {
      await db
        .insert(table)
        .values({ characterId, itemId, quantity })
        .onConflictDoUpdate({
          target: [table.characterId, table.itemId],
          set: { quantity, updatedAt: now },
        });
    } else {
      await db
        .delete(table)
        .where(and(eq(table.characterId, characterId), eq(table.itemId, itemId)));
    }
  }
}

/** The job a row describes, or null when its kind or payload isn't one this version knows. */
function toJob(row: typeof jobs.$inferSelect): Job | null {
  const payload = row.payload as { nodeId?: unknown; recipeId?: unknown; fieldId?: unknown };
  const times = { startedAt: row.startedAt.getTime(), completesAt: row.completesAt.getTime() };
  if (row.kind === "gather" && typeof payload.nodeId === "string" && isNodeId(payload.nodeId)) {
    return { kind: "gather", nodeId: payload.nodeId, ...times };
  }
  if (row.kind === "harvest" && typeof payload.fieldId === "string") {
    return { kind: "harvest", fieldId: payload.fieldId, ...times };
  }
  if (
    row.kind === "craft" &&
    typeof payload.recipeId === "string" &&
    isRecipeId(payload.recipeId)
  ) {
    return { kind: "craft", recipeId: payload.recipeId, ...times };
  }
  return null;
}

/** What a job stores in its payload column, besides kind and times. */
function jobPayload(job: Job): Record<string, string> {
  switch (job.kind) {
    case "gather":
      return { nodeId: job.nodeId };
    case "harvest":
      return { fieldId: job.fieldId };
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
        facing: after.character.facing,
      })
      .where(eq(characters.id, characterId));
  }

  await saveItems(db, inventories, characterId, before.inventory, after.inventory, now);
  await saveItems(db, storehouseItems, characterId, before.storage, after.storage, now);
  await saveFields(db, characterId, before.fields, after.fields, now);

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
