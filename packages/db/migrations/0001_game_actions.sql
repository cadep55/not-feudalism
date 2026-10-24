CREATE TABLE "game_actions" (
	"character_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_actions_character_id_request_id_pk" PRIMARY KEY("character_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "game_actions" ADD CONSTRAINT "game_actions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_actions_created_at_idx" ON "game_actions" USING btree ("created_at");