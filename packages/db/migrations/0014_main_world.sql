-- The main world everyone plays in (ADR 0004). The server joins new players
-- to the world named "main".
INSERT INTO "worlds" ("name") VALUES ('main') ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Before sections were shared, every character lived in its own copy of
-- heartland. The oldest character keeps heartland as its section in the main
-- world. Any others wait (no world, no home section) until a section is free:
-- one player per section, and their bases all overlap heartland.
UPDATE "characters"
SET "world_id" = (SELECT "id" FROM "worlds" WHERE "name" = 'main'), "home_region" = "region"
WHERE "id" = (SELECT "id" FROM "characters" ORDER BY "created_at", "id" LIMIT 1);
