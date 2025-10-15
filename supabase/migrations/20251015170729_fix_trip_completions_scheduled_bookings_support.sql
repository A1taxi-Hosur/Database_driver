/*
  # Add Scheduled Booking Support to Trip Completion Tables

  This migration adds scheduled_booking_id columns to trip completion tables
  to support both regular rides and scheduled bookings.

  ## Changes

  1. **rental_trip_completions**
    - Add `scheduled_booking_id` column (nullable)
    - Modify `ride_id` to be nullable
    - Add check constraint: at least one of ride_id or scheduled_booking_id must be present

  2. **outstation_trip_completions** 
    - Add `scheduled_booking_id` column (nullable)
    - Modify `ride_id` to be nullable
    - Add check constraint: at least one of ride_id or scheduled_booking_id must be present

  3. **airport_trip_completions**
    - Add `scheduled_booking_id` column (nullable)
    - Modify `ride_id` to be nullable
    - Add check constraint: at least one of ride_id or scheduled_booking_id must be present

  ## Notes
  - Foreign keys reference scheduled_bookings table
  - Check constraints ensure data integrity
  - Both ride_id and scheduled_booking_id can't be null simultaneously
*/

-- Modify rental_trip_completions
ALTER TABLE rental_trip_completions 
  ALTER COLUMN ride_id DROP NOT NULL;

ALTER TABLE rental_trip_completions 
  ADD COLUMN IF NOT EXISTS scheduled_booking_id uuid REFERENCES scheduled_bookings(id) ON DELETE CASCADE;

ALTER TABLE rental_trip_completions
  ADD CONSTRAINT rental_trip_completions_booking_check 
  CHECK (ride_id IS NOT NULL OR scheduled_booking_id IS NOT NULL);

-- Modify outstation_trip_completions
ALTER TABLE outstation_trip_completions 
  ALTER COLUMN ride_id DROP NOT NULL;

ALTER TABLE outstation_trip_completions 
  ADD COLUMN IF NOT EXISTS scheduled_booking_id uuid REFERENCES scheduled_bookings(id) ON DELETE CASCADE;

ALTER TABLE outstation_trip_completions
  ADD CONSTRAINT outstation_trip_completions_booking_check 
  CHECK (ride_id IS NOT NULL OR scheduled_booking_id IS NOT NULL);

-- Modify airport_trip_completions
ALTER TABLE airport_trip_completions 
  ALTER COLUMN ride_id DROP NOT NULL;

ALTER TABLE airport_trip_completions 
  ADD COLUMN IF NOT EXISTS scheduled_booking_id uuid REFERENCES scheduled_bookings(id) ON DELETE CASCADE;

ALTER TABLE airport_trip_completions
  ADD CONSTRAINT airport_trip_completions_booking_check 
  CHECK (ride_id IS NOT NULL OR scheduled_booking_id IS NOT NULL);

-- Create indexes for scheduled_booking_id
CREATE INDEX IF NOT EXISTS idx_rental_completions_scheduled_booking_id ON rental_trip_completions(scheduled_booking_id);
CREATE INDEX IF NOT EXISTS idx_outstation_completions_scheduled_booking_id ON outstation_trip_completions(scheduled_booking_id);
CREATE INDEX IF NOT EXISTS idx_airport_completions_scheduled_booking_id ON airport_trip_completions(scheduled_booking_id);
