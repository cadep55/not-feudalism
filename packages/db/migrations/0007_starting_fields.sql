-- Characters created before fields existed get the starting wheat field
-- (STARTING_FIELDS in packages/shared/src/data/farming.ts: heartland 13,14),
-- already grown: 50 wheat, 5 seeds. New characters get it at sign-up.
INSERT INTO "fields" ("character_id", "field_id", "region", "x", "y", "wheat", "seeds", "harvests", "ready_at")
SELECT "id", 'heartland:13,14', 'heartland', 13, 14, 50, 5, 0, to_timestamp(0)
FROM "characters"
ON CONFLICT DO NOTHING;
