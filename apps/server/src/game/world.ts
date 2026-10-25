import { buildings, type DbExecutor, fields, villagers } from "@nf/db";
import {
  newField,
  pickVillagerNames,
  STARTING_BUILDINGS,
  STARTING_FIELDS,
  STARTING_HOUSE,
} from "@nf/shared";

/** Gives a new character the world it starts with (Phase 1: each character has its own). */
export async function createStartingWorld(db: DbExecutor, characterId: string): Promise<void> {
  await db.insert(buildings).values(
    STARTING_BUILDINGS.map(({ id, kind, region, x, y, width, height }) => ({
      characterId,
      buildingId: id,
      kind,
      region,
      x,
      y,
      width,
      height,
    })),
  );
  // The house's villagers, idle, with names picked from the character's id.
  await db.insert(villagers).values(
    pickVillagerNames(characterId).map((name, i) => ({
      characterId,
      villagerId: `v${i + 1}`,
      name,
      houseId: STARTING_HOUSE.id,
      task: null,
    })),
  );
  if (STARTING_FIELDS.length === 0) return;
  await db.insert(fields).values(
    STARTING_FIELDS.map(({ region, x, y }) => {
      // Already grown: ready since the epoch.
      const field = newField(region, x, y, 0);
      return {
        characterId,
        fieldId: field.id,
        region,
        x,
        y,
        wheat: field.wheat,
        seeds: field.seeds,
        harvests: field.harvests,
        readyAt: new Date(field.readyAt),
      };
    }),
  );
}
