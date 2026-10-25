CREATE TABLE "buildings" (
	"character_id" uuid NOT NULL,
	"building_id" text NOT NULL,
	"kind" text NOT NULL,
	"region" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buildings_character_id_building_id_pk" PRIMARY KEY("character_id","building_id")
);
--> statement-breakpoint
ALTER TABLE "storehouse_items" ADD COLUMN "building_id" text DEFAULT 'heartland_storehouse' NOT NULL;--> statement-breakpoint
ALTER TABLE "villagers" ADD COLUMN "house_id" text DEFAULT 'heartland_house' NOT NULL;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;