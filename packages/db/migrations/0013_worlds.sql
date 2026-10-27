CREATE TABLE "worlds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worlds_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "world_id" uuid;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "home_region" text;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "characters_world_home_region_idx" ON "characters" USING btree ("world_id","home_region");