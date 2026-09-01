CREATE TABLE IF NOT EXISTS "authored_measures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "measure_key" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "domain" text NOT NULL,
  "label" text NOT NULL,
  "synonyms" text[] DEFAULT ARRAY[]::text[] NOT NULL,
  "base_field" text NOT NULL,
  "aggregation" text NOT NULL,
  "time_dimension" text,
  "time_grain" text,
  "filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "format" text DEFAULT 'number' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "definition_hash" text NOT NULL,
  "validated_hash" text,
  "validation_sql" text,
  "validation_value" jsonb,
  "validated_at" timestamp with time zone,
  "compiled_spec" jsonb,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "updated_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "authored_measures_key_version_unique"
  ON "authored_measures" ("measure_key", "version");
CREATE INDEX IF NOT EXISTS "authored_measures_status_idx"
  ON "authored_measures" ("status");

INSERT INTO "roles" ("name", "label") VALUES ('dba', 'Database Administrator')
  ON CONFLICT ("name") DO UPDATE SET "label" = EXCLUDED."label";
UPDATE "roles" SET "label" = 'Analyst' WHERE "name" = 'analyst';
