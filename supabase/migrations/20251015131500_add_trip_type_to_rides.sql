/*
  # Add trip_type to rides table for outstation trips

  1. Changes
    - Add `trip_type` column to rides table with values 'one_way' or 'round_trip'
    - This field is only applicable for outstation bookings
    - Defaults to 'round_trip' for backward compatibility

  2. Notes
    - Existing outstation rides will be treated as round_trip
    - Customer app should set this when creating outstation rides
*/

-- Add trip_type column to rides table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rides' AND column_name = 'trip_type'
  ) THEN
    ALTER TABLE rides ADD COLUMN trip_type TEXT DEFAULT 'round_trip' CHECK (trip_type IN ('one_way', 'round_trip'));
  END IF;
END $$;

-- Add comment to explain the column
COMMENT ON COLUMN rides.trip_type IS 'Type of outstation trip: one_way or round_trip. Only applicable for outstation bookings.';
