-- Missing indexes for foreign keys in app schema
CREATE INDEX IF NOT EXISTS idx_cars_user_id ON app.cars(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_car_id ON app.expenses(car_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON app.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_refuelings_car_id ON app.refuelings(car_id);
CREATE INDEX IF NOT EXISTS idx_refuelings_user_id ON app.refuelings(user_id);
CREATE INDEX IF NOT EXISTS idx_services_car_id ON app.services(car_id);
CREATE INDEX IF NOT EXISTS idx_services_user_id ON app.services(user_id);

-- Optimizing RLS policies for better performance
BEGIN;

-- cars
DROP POLICY IF EXISTS "Users can view their own cars" ON app.cars;
CREATE POLICY "Users can view their own cars" ON app.cars
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own cars" ON app.cars;
CREATE POLICY "Users can insert their own cars" ON app.cars
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own cars" ON app.cars;
CREATE POLICY "Users can update their own cars" ON app.cars
FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own cars" ON app.cars;
CREATE POLICY "Users can delete their own cars" ON app.cars
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- expenses
DROP POLICY IF EXISTS "Users can view their own expenses" ON app.expenses;
CREATE POLICY "Users can view their own expenses" ON app.expenses
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own expenses" ON app.expenses;
CREATE POLICY "Users can insert their own expenses" ON app.expenses
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own expenses" ON app.expenses;
CREATE POLICY "Users can update their own expenses" ON app.expenses
FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own expenses" ON app.expenses;
CREATE POLICY "Users can delete their own expenses" ON app.expenses
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- refuelings
DROP POLICY IF EXISTS "Users can view their own refuelings" ON app.refuelings;
CREATE POLICY "Users can view their own refuelings" ON app.refuelings
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own refuelings" ON app.refuelings;
CREATE POLICY "Users can insert their own refuelings" ON app.refuelings
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own refuelings" ON app.refuelings;
CREATE POLICY "Users can update their own refuelings" ON app.refuelings
FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own refuelings" ON app.refuelings;
CREATE POLICY "Users can delete their own refuelings" ON app.refuelings
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- services
DROP POLICY IF EXISTS "Users can view their own services" ON app.services;
CREATE POLICY "Users can view their own services" ON app.services
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own services" ON app.services;
CREATE POLICY "Users can insert their own services" ON app.services
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own services" ON app.services;
CREATE POLICY "Users can update their own services" ON app.services
FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own services" ON app.services;
CREATE POLICY "Users can delete their own services" ON app.services
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

COMMIT;
