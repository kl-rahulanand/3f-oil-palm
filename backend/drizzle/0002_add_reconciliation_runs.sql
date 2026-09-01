CREATE TABLE "reconciliation_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"measure_id" text NOT NULL,
	"primary_value" text,
	"alt_value" text,
	"diff" double precision,
	"within_tolerance" boolean NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "reconciliation_runs_measure_ran_at_idx" ON "reconciliation_runs" USING btree ("measure_id","ran_at");
