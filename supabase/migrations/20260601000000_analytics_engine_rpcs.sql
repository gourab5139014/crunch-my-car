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

-- 4. Get Fleet Stats (Bulk)
-- Resolves N+1 issues by fetching stats for multiple cars in one call.
CREATE OR REPLACE FUNCTION app.get_fleet_stats(p_car_ids UUID[])
RETURNS TABLE (
    car_id UUID,
    stats JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT auth.uid() INTO v_user_id;
    
    RETURN QUERY
    WITH fuel_sums AS (
        SELECT r.car_id, COALESCE(SUM(total_cost), 0) as cost, COUNT(*) as cnt, MIN(odometer) as min_o, MAX(odometer) as max_o
        FROM app.refuelings r
        WHERE r.car_id = ANY(p_car_ids) AND r.user_id = v_user_id
        GROUP BY r.car_id
    ),
    service_sums AS (
        SELECT s.car_id, COALESCE(SUM(total_cost), 0) as cost
        FROM app.services s
        WHERE s.car_id = ANY(p_car_ids) AND s.user_id = v_user_id
        GROUP BY s.car_id
    ),
    expense_sums AS (
        SELECT e.car_id, COALESCE(SUM(amount), 0) as cost
        FROM app.expenses e
        WHERE e.car_id = ANY(p_car_ids) AND e.user_id = v_user_id
        GROUP BY e.car_id
    ),
    efficiency AS (
        -- Calculate efficiency for each car: (max_o - min_o) / sum(volume after first fill)
        SELECT 
            r.car_id,
            CASE 
                WHEN MAX(r.odometer) > MIN(r.odometer) THEN
                    (MAX(r.odometer) - MIN(r.odometer)) / NULLIF(SUM(CASE WHEN r.odometer > (SELECT MIN(odometer) FROM app.refuelings r2 WHERE r2.car_id = r.car_id) THEN r.volume ELSE 0 END), 0)
                ELSE 0
            END as efficiency
        FROM app.refuelings r
        WHERE r.car_id = ANY(p_car_ids) AND r.user_id = v_user_id
        GROUP BY r.car_id
    )
    SELECT 
        c.id,
        JSONB_BUILD_OBJECT(
            'total_spend', COALESCE(f.cost, 0) + COALESCE(s.cost, 0) + COALESCE(e.cost, 0),
            'fuel_efficiency', ROUND(COALESCE(eff.efficiency, 0), 2),
            'total_distance', COALESCE(f.max_o - f.min_o, 0),
            'refueling_count', COALESCE(f.cnt, 0)
        )
    FROM app.cars c
    LEFT JOIN fuel_sums f ON f.car_id = c.id
    LEFT JOIN service_sums s ON s.car_id = c.id
    LEFT JOIN expense_sums e ON e.car_id = c.id
    LEFT JOIN efficiency eff ON eff.car_id = c.id
    WHERE c.id = ANY(p_car_ids) AND c.user_id = v_user_id;
END;
$$;
