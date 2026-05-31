-- Composite indexes for faster analytics (Equality then Range)
CREATE INDEX IF NOT EXISTS idx_refuelings_car_date ON app.refuelings(car_id, date);
CREATE INDEX IF NOT EXISTS idx_services_car_date ON app.services(car_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_car_date ON app.expenses(car_id, date);

-- 1. Get Vehicle Stats
-- High-level summary of vehicle performance and spending.
CREATE OR REPLACE FUNCTION app.get_vehicle_stats(p_car_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_total_fuel_cost NUMERIC;
    v_total_service_cost NUMERIC;
    v_total_expense_cost NUMERIC;
    v_total_volume NUMERIC;
    v_min_odometer INTEGER;
    v_max_odometer INTEGER;
    v_fuel_efficiency NUMERIC := 0;
BEGIN
    -- Security Check
    SELECT auth.uid() INTO v_user_id;
    IF NOT EXISTS (SELECT 1 FROM app.cars WHERE id = p_car_id AND user_id = v_user_id) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- 1. Total Spend Breakdown
    SELECT COALESCE(SUM(total_cost), 0) INTO v_total_fuel_cost FROM app.refuelings WHERE car_id = p_car_id;
    SELECT COALESCE(SUM(total_cost), 0) INTO v_total_service_cost FROM app.services WHERE car_id = p_car_id;
    SELECT COALESCE(SUM(amount), 0) INTO v_total_expense_cost FROM app.expenses WHERE car_id = p_car_id;

    -- 2. Fuel Efficiency (Measured between first and last fill)
    SELECT 
        MIN(odometer),
        MAX(odometer)
    INTO 
        v_min_odometer,
        v_max_odometer
    FROM app.refuelings 
    WHERE car_id = p_car_id;

    IF v_max_odometer > v_min_odometer THEN
        -- Volume used is sum of all volumes except the first fill
        SELECT SUM(volume) INTO v_total_volume 
        FROM app.refuelings 
        WHERE car_id = p_car_id 
        AND odometer > v_min_odometer;
        
        IF v_total_volume > 0 THEN
            v_fuel_efficiency := (v_max_odometer - v_min_odometer) / v_total_volume;
        END IF;
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'total_spend', v_total_fuel_cost + v_total_service_cost + v_total_expense_cost,
        'spending_breakdown', JSONB_BUILD_OBJECT(
            'fuel', v_total_fuel_cost,
            'service', v_total_service_cost,
            'expense', v_total_expense_cost
        ),
        'total_distance', COALESCE(v_max_odometer - v_min_odometer, 0),
        'fuel_efficiency', ROUND(v_fuel_efficiency, 2),
        'refueling_count', (SELECT COUNT(*) FROM app.refuelings WHERE car_id = p_car_id)
    );
END;
$$;

-- 2. Get Fuel Efficiency Trend
-- Time-series data for fuel efficiency charts.
CREATE OR REPLACE FUNCTION app.get_fuel_efficiency_trend(p_car_id UUID)
RETURNS TABLE (
    date DATE,
    efficiency NUMERIC,
    odometer INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH logs AS (
        SELECT 
            date,
            odometer,
            volume,
            LAG(odometer) OVER (ORDER BY odometer) as prev_odometer
        FROM app.refuelings
        WHERE car_id = $1
        AND user_id = (SELECT auth.uid())
    )
    SELECT 
        date,
        ROUND((odometer - prev_odometer) / volume, 2) as efficiency,
        odometer
    FROM logs
    WHERE prev_odometer IS NOT NULL
    AND volume > 0
    ORDER BY odometer ASC;
$$;

-- 3. Get Monthly Spending
-- Spending trends grouped by month for the last year.
CREATE OR REPLACE FUNCTION app.get_monthly_spending(p_car_id UUID)
RETURNS TABLE (
    month DATE,
    fuel NUMERIC,
    service NUMERIC,
    expense NUMERIC,
    total NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH all_spend AS (
        SELECT date_trunc('month', date)::date as m, total_cost as f, 0 as s, 0 as e FROM app.refuelings WHERE car_id = $1 AND user_id = (SELECT auth.uid())
        UNION ALL
        SELECT date_trunc('month', date)::date as m, 0 as f, total_cost as s, 0 as e FROM app.services WHERE car_id = $1 AND user_id = (SELECT auth.uid())
        UNION ALL
        SELECT date_trunc('month', date)::date as m, 0 as f, 0 as s, amount as e FROM app.expenses WHERE car_id = $1 AND user_id = (SELECT auth.uid())
    )
    SELECT 
        m as month,
        COALESCE(SUM(f), 0) as fuel,
        COALESCE(SUM(s), 0) as service,
        COALESCE(SUM(e), 0) as expense,
        COALESCE(SUM(f + s + e), 0) as total
    FROM all_spend
    WHERE m >= (now() - interval '1 year')
    GROUP BY m
    ORDER BY m ASC;
$$;
