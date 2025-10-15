/*
  # Fix Trip Completions Constraints

  1. Changes
    - Remove restrictive CHECK constraint on vehicle_type to allow any value
    - This allows flexibility for new vehicle types without schema changes

  2. Reason
    - The original constraint was blocking inserts with vehicle types not in the predefined list
    - Modern taxi systems need flexibility to add new vehicle categories
*/

-- Drop the old constraint if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'trip_completions' 
    AND constraint_name LIKE '%vehicle_type_check%'
  ) THEN
    ALTER TABLE trip_completions DROP CONSTRAINT trip_completions_vehicle_type_check;
  END IF;
END $$;

-- Add a more flexible constraint that just ensures it's not empty
ALTER TABLE trip_completions 
DROP CONSTRAINT IF EXISTS trip_completions_vehicle_type_check;

ALTER TABLE trip_completions
ADD CONSTRAINT trip_completions_vehicle_type_not_empty 
CHECK (length(trim(vehicle_type)) > 0);
