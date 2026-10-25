CREATE TABLE "villagers" (
	"character_id" uuid NOT NULL,
	"villager_id" text NOT NULL,
	"name" text NOT NULL,
	"task" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "villagers_character_id_villager_id_pk" PRIMARY KEY("character_id","villager_id")
);
--> statement-breakpoint
ALTER TABLE "villagers" ADD CONSTRAINT "villagers_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;