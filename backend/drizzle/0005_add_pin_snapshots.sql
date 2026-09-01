CREATE TABLE "pin_snapshots" (
  "pin_id" uuid PRIMARY KEY NOT NULL REFERENCES "dashboard_pins"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "result_json" jsonb,
  "chart_type" text,
  "data_as_of" timestamp with time zone,
  "computed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "error_message" text
);
