ALTER TABLE "migration_probe" ADD COLUMN "rolled_back_column" text;
--> statement-breakpoint
CREATE TABLE "migration_probe_invalid" (
	"id" definitely_not_a_postgres_type NOT NULL
);
