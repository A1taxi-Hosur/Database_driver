/*
  # Add admin assignment tracking to rides

  1. Changes
    - Add `assigned_by_admin` boolean column to rides table (default false)
    - Add `assigned_at` timestamp column to track when admin assigned the ride
    - Add index on assigned_by_admin for faster queries
    
  2. Purpose
    - Track which rides were assigned by admin (rental, outstation, airport)
    - Distinguish between direct requests (regular) and admin assignments
    - Enable scheduled bookings tab to show only admin-assigned rides
*/

-- Add assigned_by_admin column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rides' AND column_name = 'assigned_by_admin'
  ) THEN
    ALTER TABLE rides ADD COLUMN assigned_by_admin boolean DEFAULT false;
  END IF;
END $$;

-- Add assigned_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rides' AND column_name = 'assigned_at'
  ) THEN
    ALTER TABLE rides ADD COLUMN assigned_at timestamptz;
  END IF;
END $$;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_rides_assigned_by_admin ON rides(assigned_by_admin) WHERE assigned_by_admin = true;

-- Add index for driver assignments
CREATE INDEX IF NOT EXISTS idx_rides_driver_assigned ON rides(driver_id, assigned_by_admin) WHERE driver_id IS NOT NULL;