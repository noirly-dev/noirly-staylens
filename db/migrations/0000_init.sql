CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "enrichments" (
	"place_id" text PRIMARY KEY NOT NULL,
	"tags" jsonb NOT NULL,
	"vocab_hash" text NOT NULL,
	"model" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_matches" (
	"place_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_property_id" text NOT NULL,
	"provider_name" text NOT NULL,
	"location" geometry(point) NOT NULL,
	"confidence" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_matches_place_id_provider_pk" PRIMARY KEY("place_id","provider")
);
--> statement-breakpoint
CREATE INDEX "entity_matches_location_idx" ON "entity_matches" USING gist ("location");