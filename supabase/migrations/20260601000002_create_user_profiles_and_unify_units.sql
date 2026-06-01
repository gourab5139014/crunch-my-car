-- Migration: Unify units under global user profile
BEGIN;

-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS app.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    unit_preference TEXT NOT NULL DEFAULT 'imperial',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Enable RLS
ALTER TABLE app.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" 
ON app.profiles FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()) = id );

CREATE POLICY "Users can update their own profile" 
ON app.profiles FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()) = id )
WITH CHECK ( (SELECT auth.uid()) = id );

-- 3. Migrate existing data
-- Take the 'most metric' preference as a guess if they have multiple cars, 
-- or just use the first one found.
INSERT INTO app.profiles (id, unit_preference)
SELECT DISTINCT ON (user_id) user_id, unit_preference
FROM app.cars
ON CONFLICT (id) DO NOTHING;

-- For users who have no cars but exist in auth.users, create a default profile
INSERT INTO app.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 4. Automatic Profile Creation Trigger
CREATE OR REPLACE FUNCTION app.handle_new_user() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO app.profiles (id, unit_preference)
  VALUES (new.id, 'imperial');
  RETURN new;
END;
$$;

-- Trigger on auth.users
-- Note: We check if the trigger exists first to be idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app.handle_new_user();

-- 5. Cleanup app.cars
ALTER TABLE app.cars DROP COLUMN IF EXISTS unit_preference;

COMMIT;
