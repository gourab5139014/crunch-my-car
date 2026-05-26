-- Create a unified timeline view for all vehicle activities
CREATE OR REPLACE VIEW app.vehicle_timeline WITH (security_invoker = true) AS
  SELECT 
    id AS source_id, 
    car_id, 
    user_id, 
    'fuel' AS activity_type, 
    date, 
    total_cost AS amount, 
    odometer, 
    concat(liters, ' liters') AS description
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

-- Grant access to the view
GRANT SELECT ON app.vehicle_timeline TO authenticated, anon;
