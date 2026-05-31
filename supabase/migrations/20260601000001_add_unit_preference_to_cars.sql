-- Add unit_preference to cars table
ALTER TABLE app.cars ADD COLUMN unit_preference TEXT NOT NULL DEFAULT 'imperial';
-- We default to imperial as requested by the user's preference.
