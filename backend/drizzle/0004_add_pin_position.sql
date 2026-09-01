ALTER TABLE "dashboard_pins" ADD COLUMN "position" integer NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) - 1 AS rn
  FROM dashboard_pins
)
UPDATE dashboard_pins d
SET position = o.rn
FROM ordered o
WHERE d.id = o.id;
