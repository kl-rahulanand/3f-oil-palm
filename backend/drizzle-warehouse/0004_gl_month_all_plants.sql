DROP VIEW "public"."actual_by_gl_month";--> statement-breakpoint
CREATE VIEW "public"."actual_by_gl_month" AS (
  SELECT
    plant,
    gl_code,
    month,
    SUM(actual_net)::numeric(18, 2) AS actual_net
  FROM actual_by_key_month
  GROUP BY plant, gl_code, month
);
