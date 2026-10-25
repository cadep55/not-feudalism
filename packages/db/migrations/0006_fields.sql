CREATE TABLE "fields" (
	"character_id" uuid NOT NULL,
	"field_id" text NOT NULL,
	"region" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"wheat" integer NOT NULL,
	"seeds" integer NOT NULL,
	"harvests" integer DEFAULT 0 NOT NULL,
	"ready_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fields_character_id_field_id_pk" PRIMARY KEY("character_id","field_id"),
	CONSTRAINT "fields_wheat_positive" CHECK ("fields"."wheat" > 0),
	CONSTRAINT "fields_seeds_not_negative" CHECK ("fields"."seeds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;