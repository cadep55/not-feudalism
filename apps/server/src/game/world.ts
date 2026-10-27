import { buildings, type DbExecutor, fields, villagers } from "@nf/db";
import {
  newField,
  pickVillagerNames,
  STARTING_FIELDS,
  STARTING_HOUSE,
  startingBuildings,
} from "@nf/shared";

/** Gives a new character its starting base, in its home section. */
export async function createStartingWorld(
  db: DbExecutor,
  characterId: string,
  homeRegion: string,
): Promise<void> {
  await db.insert(buildings).values(
    startingBuildings(homeRegion).map(({ id, kind, region, x, y, width, height }) => ({
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
    STARTING_FIELDS.map(({ x, y }) => {
      const region = homeRegion;
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
