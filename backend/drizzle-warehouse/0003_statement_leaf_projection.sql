ALTER TABLE "mis_budget" ADD COLUMN "leaf_key" text;--> statement-breakpoint
ALTER TABLE "mis_budget" ADD CONSTRAINT "mis_budget_leaf_key_required" CHECK ("leaf_key" IS NOT NULL) NOT VALID;--> statement-breakpoint
ALTER TABLE "mis_budget" DROP CONSTRAINT "mis_budget_batch_grain_unique";--> statement-breakpoint
ALTER TABLE "mis_budget" ADD CONSTRAINT "mis_budget_batch_grain_unique" UNIQUE("batch_id","format_id","period","leaf_key");--> statement-breakpoint
CREATE TABLE "mis_budget_outline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"node_key" text NOT NULL,
	"parent_key" text,
	"depth" integer NOT NULL,
	"s_no" text,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"gl_code" text,
	"leaf_key" text,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mis_budget_outline_depth_check" CHECK ("mis_budget_outline"."depth" >= 0),
	CONSTRAINT "mis_budget_outline_sort_order_check" CHECK ("mis_budget_outline"."sort_order" >= 0),
	CONSTRAINT "mis_budget_outline_leaf_check" CHECK (("mis_budget_outline"."gl_code" IS NULL AND "mis_budget_outline"."leaf_key" IS NULL) OR ("mis_budget_outline"."gl_code" IS NOT NULL AND "mis_budget_outline"."leaf_key" IS NOT NULL)),
	CONSTRAINT "mis_budget_outline_batch_node_unique" UNIQUE("batch_id","node_key"),
	CONSTRAINT "mis_budget_outline_batch_leaf_unique" UNIQUE("batch_id","leaf_key"),
	CONSTRAINT "mis_budget_outline_batch_id_ingest_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ingest_batch"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "mis_budget_outline_parent_fk" FOREIGN KEY ("batch_id","parent_key") REFERENCES "public"."mis_budget_outline"("batch_id","node_key") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_mis_budget_outline_batch_id" ON "mis_budget_outline" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "mis_budget" ADD CONSTRAINT "mis_budget_outline_leaf_fk" FOREIGN KEY ("batch_id","leaf_key") REFERENCES "public"."mis_budget_outline"("batch_id","leaf_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "ingest_batch"
SET "is_active" = false, "updated_at_utc" = now()
WHERE "source_kind" = 'budget' AND "is_active";--> statement-breakpoint
CREATE VIEW "public"."budget_by_leaf_month" AS (
  SELECT
    b.leaf_key,
    b.period AS month,
    SUM(b.budget_amount)::numeric(18, 2) AS budget_net,
    SUM(b.rollover_amount)::numeric(18, 2) AS rollover_net
  FROM mis_budget AS b
  INNER JOIN ingest_batch AS bt ON bt.id = b.batch_id
  INNER JOIN mis_budget_outline AS outline
    ON outline.batch_id = b.batch_id AND outline.leaf_key = b.leaf_key
  WHERE bt.source_kind = 'budget' AND bt.is_active
  GROUP BY b.leaf_key, b.period
);
