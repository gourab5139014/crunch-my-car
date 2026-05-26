-- Missing indexes for foreign keys in public schema
CREATE INDEX IF NOT EXISTS idx_cars_user_id ON public.cars(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_car_id ON public.expenses(car_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_refuelings_car_id ON public.refuelings(car_id);
CREATE INDEX IF NOT EXISTS idx_refuelings_user_id ON public.refuelings(user_id);
CREATE INDEX IF NOT EXISTS idx_services_car_id ON public.services(car_id);
CREATE INDEX IF NOT EXISTS idx_services_user_id ON public.services(user_id);

-- Optimizing RLS policies for better performance
BEGIN;

-- cars
DROP POLICY IF EXISTS "Users can view their own cars" ON public.cars;
CREATE POLICY "Users can view their own cars" ON public.cars
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own cars" ON public.cars;
CREATE POLICY "Users can insert their own cars" ON public.cars
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own cars" ON public.cars;
CREATE POLICY "Users can update their own cars" ON public.cars
FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own cars" ON public.cars;
CREATE POLICY "Users can delete their own cars" ON public.cars
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- expenses
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
CREATE POLICY "Users can view their own expenses" ON public.expenses
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own expenses" ON public.expenses;
CREATE POLICY "Users can insert their own expenses" ON public.expenses
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
CREATE POLICY "Users can update their own expenses" ON public.expenses
FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
CREATE POLICY "Users can delete their own expenses" ON public.expenses
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- refuelings
DROP POLICY IF EXISTS "Users can view their own refuelings" ON public.refuelings;
CREATE POLICY "Users can view their own refuelings" ON public.refuelings
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own refuelings" ON public.refuelings;
CREATE POLICY "Users can insert their own refuelings" ON public.refuelings
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own refuelings" ON public.refuelings;
CREATE POLICY "Users can update their own refuelings" ON public.refuelings
FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own refuelings" ON public.refuelings;
CREATE POLICY "Users can delete their own refuelings" ON public.refuelings
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- services
DROP POLICY IF EXISTS "Users can view their own services" ON public.services;
CREATE POLICY "Users can view their own services" ON public.services
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own services" ON public.services;
CREATE POLICY "Users can insert their own services" ON public.services
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own services" ON public.services;
CREATE POLICY "Users can update their own services" ON public.services
FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own services" ON public.services;
CREATE POLICY "Users can delete their own services" ON public.services
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

COMMIT;
