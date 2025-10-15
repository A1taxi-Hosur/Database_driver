/*
  # Add Driver and Vehicle Details to Trip Completions

  1. New Columns
    - `driver_name` (text) - Driver's full name at time of completion
    - `driver_phone` (text) - Driver's phone number
    - `driver_rating` (numeric) - Driver's rating at time of completion
    - `vehicle_id` (uuid) - Reference to vehicle used
    - `vehicle_make` (text) - Vehicle manufacturer
    - `vehicle_model` (text) - Vehicle model
    - `vehicle_color` (text) - Vehicle color
    - `vehicle_license_plate` (text) - Vehicle registration number
    - `vehicle_type` (text) - Already exists, kept for consistency

  2. Purpose
    - Store driver and vehicle information for customer receipt display
    - Allow customers to see complete trip details including driver info
    - Enable customer rating and feedback functionality
    - Maintain historical accuracy of driver/vehicle details

  3. Security
    - RLS policies already in place allow customers to view their completions
    - No additional security changes needed
*/

-- Add driver details columns
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='driver_name') THEN
    ALTER TABLE trip_completions ADD COLUMN driver_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='driver_phone') THEN
    ALTER TABLE trip_completions ADD COLUMN driver_phone text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='driver_rating') THEN
    ALTER TABLE trip_completions ADD COLUMN driver_rating numeric CHECK (driver_rating >= 0 AND driver_rating <= 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='vehicle_id') THEN
    ALTER TABLE trip_completions ADD COLUMN vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='vehicle_make') THEN
    ALTER TABLE trip_completions ADD COLUMN vehicle_make text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='vehicle_model') THEN
    ALTER TABLE trip_completions ADD COLUMN vehicle_model text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='vehicle_color') THEN
    ALTER TABLE trip_completions ADD COLUMN vehicle_color text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='vehicle_license_plate') THEN
    ALTER TABLE trip_completions ADD COLUMN vehicle_license_plate text;
  END IF;
END $$;

-- Create index on vehicle_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_trip_completions_vehicle_id ON trip_completions(vehicle_id);

-- Add comment
COMMENT ON COLUMN trip_completions.driver_name IS 'Driver full name at time of trip completion';
COMMENT ON COLUMN trip_completions.vehicle_id IS 'Reference to vehicle used for the trip';
