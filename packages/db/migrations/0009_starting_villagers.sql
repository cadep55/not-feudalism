-- Characters created before villagers existed get their house's 3 villagers,
-- idle. (New characters get names picked at random from VILLAGER_NAMES at
-- sign-up; existing ones get these three.)
INSERT INTO "villagers" ("character_id", "villager_id", "name", "task")
SELECT c."id", v."villager_id", v."name", NULL
FROM "characters" c
CROSS JOIN (VALUES ('v1', 'Aldric'), ('v2', 'Maud'), ('v3', 'Osric')) AS v("villager_id", "name")
ON CONFLICT DO NOTHING;
