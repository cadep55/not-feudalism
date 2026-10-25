import {
  buildings,
  characters,
  type DbExecutor,
  fields,
  inventories,
  jobs,
  storehouseItems,
  villagers,
} from "@nf/db";
import {
  type Building,
  DEFAULT_FACING,
  type Field,
  type GameState,
  type Inventory,
  ITEM_IDS,
  isBuildingKind,
  isDirection,
  isItemId,
  isNodeId,
  isRecipeId,
  type Job,
  type Villager,
  type VillagerTask,
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

  const inventory = await loadInventory(db, characterId);
  const buildingRows = await db
    .select()
    .from(buildings)
    .where(eq(buildings.characterId, characterId))
    .orderBy(buildings.createdAt, buildings.buildingId);
  const world = buildingRows.flatMap((row) => toBuilding(row) ?? []);
  const storage = await loadStorage(db, characterId, world);
  const fieldRows = await db.select().from(fields).where(eq(fields.characterId, characterId));
  const villagerRows = await db
    .select()
    .from(villagers)
    .where(eq(villagers.characterId, characterId))
    .orderBy(villagers.villagerId);

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
    buildings: world,
    storage,
    fields: fieldRows.map(toField),
    villagers: villagerRows.map((row) => ({
      id: row.villagerId,
      name: row.name,
      houseId: row.houseId,
      // Written only by saveState from validated VillagerTask objects.
      task: (row.task as VillagerTask | null) ?? null,
    })),
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

function toBuilding(row: typeof buildings.$inferSelect): Building | null {
  if (!isBuildingKind(row.kind)) return null;
  return {
    id: row.buildingId,
    region: row.region,
    kind: row.kind,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
  };
}

/** Inserts new buildings and deletes removed ones (buildings never move). */
async function saveBuildings(
  db: DbExecutor,
  characterId: string,
  before: Building[],
  after: Building[],
): Promise<void> {
  const previous = new Set(before.map((b) => b.id));
  const current = new Set(after.map((b) => b.id));
  for (const building of after) {
    if (previous.has(building.id)) continue;
    await db.insert(buildings).values({
      characterId,
      buildingId: building.id,
      kind: building.kind,
      region: building.region,
      x: building.x,
      y: building.y,
      width: building.width,
      height: building.height,
    });
  }
  for (const building of before) {
    if (current.has(building.id)) continue;
    await db
      .delete(buildings)
      .where(and(eq(buildings.characterId, characterId), eq(buildings.buildingId, building.id)));
  }
}

async function loadInventory(db: DbExecutor, characterId: string): Promise<Inventory> {
  const rows = await db
    .select({ itemId: inventories.itemId, quantity: inventories.quantity })
    .from(inventories)
    .where(eq(inventories.characterId, characterId));
  return toItems(rows);
}

/** What each storehouse holds; every storehouse gets an entry, even when empty. */
async function loadStorage(
  db: DbExecutor,
  characterId: string,
  world: Building[],
): Promise<GameState["storage"]> {
  const rows = await db
    .select({
      buildingId: storehouseItems.buildingId,
      itemId: storehouseItems.itemId,
      quantity: storehouseItems.quantity,
    })
    .from(storehouseItems)
    .where(eq(storehouseItems.characterId, characterId));
  const storage: GameState["storage"] = {};
  for (const building of world) {
    if (building.kind !== "storehouse") continue;
    storage[building.id] = toItems(rows.filter((r) => r.buildingId === building.id));
  }
  return storage;
}

function toItems(rows: { itemId: string; quantity: number }[]): Inventory {
  const items: Inventory = {};
  for (const { itemId, quantity } of rows) {
    if (isItemId(itemId)) items[itemId] = quantity;
  }
  return items;
}

/** Writes changed carried counts; rows exist only while a count is above zero. */
async function saveInventory(
  db: DbExecutor,
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
}

/** Writes changed stored counts, storehouse by storehouse; rows exist only above zero. */
async function saveStorage(
  db: DbExecutor,
  characterId: string,
  before: GameState["storage"],
  after: GameState["storage"],
  now: Date,
): Promise<void> {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const buildingId of ids) {
    const was = before[buildingId] ?? {};
    const is = after[buildingId] ?? {};
    for (const itemId of ITEM_IDS) {
      const quantity = is[itemId] ?? 0;
      if (quantity === (was[itemId] ?? 0)) continue;
      if (quantity > 0) {
        await db
          .insert(storehouseItems)
          .values({ characterId, buildingId, itemId, quantity })
          .onConflictDoUpdate({
            target: [
              storehouseItems.characterId,
              storehouseItems.buildingId,
              storehouseItems.itemId,
            ],
            set: { quantity, updatedAt: now },
          });
      } else {
        await db
          .delete(storehouseItems)
          .where(
            and(
              eq(storehouseItems.characterId, characterId),
              eq(storehouseItems.buildingId, buildingId),
              eq(storehouseItems.itemId, itemId),
            ),
          );
      }
    }
  }
}

/** Inserts new villagers, saves changed tasks, and deletes villagers who left. */
async function saveVillagers(
  db: DbExecutor,
  characterId: string,
  before: Villager[],
  after: Villager[],
  now: Date,
): Promise<void> {
  const current = new Set(after.map((v) => v.id));
  for (const villager of after) {
    const old = before.find((v) => v.id === villager.id);
    if (!old) {
      await db.insert(villagers).values({
        characterId,
        villagerId: villager.id,
        name: villager.name,
        houseId: villager.houseId,
        task: villager.task,
      });
      continue;
    }
    if (JSON.stringify(old.task) === JSON.stringify(villager.task)) continue;
    await db
      .update(villagers)
      .set({ task: villager.task, updatedAt: now })
      .where(and(eq(villagers.characterId, characterId), eq(villagers.villagerId, villager.id)));
  }
  for (const villager of before) {
    if (current.has(villager.id)) continue;
    await db
      .delete(villagers)
      .where(and(eq(villagers.characterId, characterId), eq(villagers.villagerId, villager.id)));
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

  await saveInventory(db, characterId, before.inventory, after.inventory, now);
  // Buildings first, so a new storehouse exists before anything is stored in it.
  await saveBuildings(db, characterId, before.buildings, after.buildings);
  await saveStorage(db, characterId, before.storage, after.storage, now);
  await saveFields(db, characterId, before.fields, after.fields, now);
  await saveVillagers(db, characterId, before.villagers, after.villagers, now);

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
