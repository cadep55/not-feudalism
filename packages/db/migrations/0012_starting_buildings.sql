-- Characters created before players could build get the starting buildings
-- (STARTING_BUILDINGS in packages/shared/src/data/buildings.ts): the storehouse
-- at heartland 15,8 and the house at heartland 5,12, both 2x2. New characters
-- get them at sign-up.
INSERT INTO "buildings" ("character_id", "building_id", "kind", "region", "x", "y", "width", "height")
SELECT c."id", b."building_id", b."kind", 'heartland', b."x", b."y", 2, 2
FROM "characters" c
CROSS JOIN (VALUES ('heartland_storehouse', 'storehouse', 15, 8), ('heartland_house', 'house', 5, 12))
  AS b("building_id", "kind", "x", "y")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Working villagers deliver to a storehouse named in their task; before there
-- could be more than one, that was always the starting storehouse.
UPDATE "villagers"
SET "task" = "task" || '{"storehouseId": "heartland_storehouse"}'::jsonb
WHERE "task" IS NOT NULL AND NOT ("task" ? 'storehouseId');
