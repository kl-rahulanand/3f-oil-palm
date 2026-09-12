-- Context is King: this migration is deliberately limited to the two exploration
-- tables shipped by this story; other declarations in schema.ts remain absent.
CREATE TABLE "saved_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "selection" jsonb NOT NULL,
  "chart_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "saved_queries_user_id_idx" ON "saved_queries" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "dashboard_pins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text DEFAULT '' NOT NULL,
  "selection" jsonb NOT NULL,
  "chart_type" text,
  "view_prefs" jsonb,
  "definition_version" text,
  "refresh_cadence" text,
  "last_refresh" timestamp with time zone,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dashboard_pins_user_id_idx" ON "dashboard_pins" USING btree ("user_id");
