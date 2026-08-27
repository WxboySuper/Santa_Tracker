CREATE TABLE "audit_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"action" varchar(64) NOT NULL,
	"actor" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"schema_version" varchar(32) NOT NULL,
	"checksum" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author" varchar(128) NOT NULL,
	"snapshot" jsonb NOT NULL
);
