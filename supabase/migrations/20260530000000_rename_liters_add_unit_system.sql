-- Rename liters → volume so the column name is unit-agnostic.
-- Add unit_system to document the unit the stored values are expressed in.
ALTER TABLE app.refuelings RENAME COLUMN liters TO volume;
ALTER TABLE app.refuelings ADD COLUMN unit_system TEXT NOT NULL DEFAULT 'metric';

-- Rebuild the timeline view to reference the renamed column.
CREATE OR REPLACE VIEW app.vehicle_timeline WITH (security_invoker = true) AS
  SELECT
    id AS source_id,
    car_id,
    user_id,
    'fuel' AS activity_type,
    date,
    total_cost AS amount,
    odometer,
    concat(volume, ' L') AS description
  FROM app.refuelings
  UNION ALL
  SELECT
    id AS source_id,
    car_id,
    user_id,
    'service' AS activity_type,
    date,
    total_cost AS amount,
    odometer,
    description
  FROM app.services
  UNION ALL
  SELECT
    id AS source_id,
    car_id,
    user_id,
    'expense' AS activity_type,
    date,
    amount,
    NULL::integer AS odometer,
    concat(category, ': ', description) AS description
  FROM app.expenses;

GRANT SELECT ON app.vehicle_timeline TO authenticated, anon;
