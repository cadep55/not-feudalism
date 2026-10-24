CREATE TABLE "storehouse_items" (
	"character_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storehouse_items_character_id_item_id_pk" PRIMARY KEY("character_id","item_id"),
	CONSTRAINT "storehouse_items_quantity_positive" CHECK ("storehouse_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "storehouse_items" ADD CONSTRAINT "storehouse_items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;