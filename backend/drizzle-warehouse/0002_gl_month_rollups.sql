CREATE VIEW "public"."actual_by_gl_month" AS (
  SELECT
    'DUB'::text AS plant,
    gl_code,
    month,
    SUM(actual_net)::numeric(18, 2) AS actual_net
  FROM actual_by_key_month
  WHERE plant = 'DUB'
  GROUP BY gl_code, month
);--> statement-breakpoint
CREATE VIEW "public"."budget_by_gl_month" AS (
  SELECT
    b.gl_code,
    b.period AS month,
    SUM(b.budget_amount)::numeric(18, 2) AS budget_net,
    SUM(b.rollover_amount)::numeric(18, 2) AS rollover_net,
    array_agg(DISTINCT b.cost_center ORDER BY b.cost_center) AS budget_component_labels
  FROM mis_budget AS b
  INNER JOIN ingest_batch AS bt ON bt.id = b.batch_id
  WHERE bt.source_kind = 'budget' AND bt.is_active
  GROUP BY b.gl_code, b.period
);
