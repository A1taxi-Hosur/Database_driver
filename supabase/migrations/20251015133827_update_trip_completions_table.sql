/*
  # Update Trip Completions Table

  1. Changes
    - Add missing columns: driver_id, customer_id, trip_type, pickup_address, destination_address
    - Add missing fare breakdown columns: gst_on_charges, gst_on_platform_fee
    - Add rental/scheduled fields: rental_hours, scheduled_time, completed_at
    - Rename fare_breakdown to fare_details for consistency
    - Add proper foreign key constraints
    - Set up RLS policies for drivers and customers

  2. Security
    - Enable RLS if not already enabled
    - Add policies for drivers and customers to view their own completions
    - Add policy to allow authenticated users to insert completions
    - Prevent updates and deletes (immutable records)
*/

-- Add missing columns if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='driver_id') THEN
    ALTER TABLE trip_completions ADD COLUMN driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='customer_id') THEN
    ALTER TABLE trip_completions ADD COLUMN customer_id uuid REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='trip_type') THEN
    ALTER TABLE trip_completions ADD COLUMN trip_type text CHECK (trip_type IN ('one_way', 'round_trip'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='pickup_address') THEN
    ALTER TABLE trip_completions ADD COLUMN pickup_address text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='destination_address') THEN
    ALTER TABLE trip_completions ADD COLUMN destination_address text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='gst_on_charges') THEN
    ALTER TABLE trip_completions ADD COLUMN gst_on_charges numeric NOT NULL DEFAULT 0 CHECK (gst_on_charges >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='gst_on_platform_fee') THEN
    ALTER TABLE trip_completions ADD COLUMN gst_on_platform_fee numeric NOT NULL DEFAULT 0 CHECK (gst_on_platform_fee >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='rental_hours') THEN
    ALTER TABLE trip_completions ADD COLUMN rental_hours integer CHECK (rental_hours > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='scheduled_time') THEN
    ALTER TABLE trip_completions ADD COLUMN scheduled_time timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='completed_at') THEN
    ALTER TABLE trip_completions ADD COLUMN completed_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- Rename fare_breakdown to fare_details if fare_breakdown exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='fare_breakdown') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='fare_details') THEN
    ALTER TABLE trip_completions RENAME COLUMN fare_breakdown TO fare_details;
  END IF;

  -- Add fare_details if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_completions' AND column_name='fare_details') THEN
    ALTER TABLE trip_completions ADD COLUMN fare_details jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_trip_completions_driver_id ON trip_completions(driver_id);
CREATE INDEX IF NOT EXISTS idx_trip_completions_customer_id ON trip_completions(customer_id);
CREATE INDEX IF NOT EXISTS idx_trip_completions_completed_at ON trip_completions(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_completions_booking_type ON trip_completions(booking_type);

-- Enable Row Level Security
ALTER TABLE trip_completions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Drivers can view own trip completions" ON trip_completions;
DROP POLICY IF EXISTS "Customers can view own trip completions" ON trip_completions;
DROP POLICY IF EXISTS "System can insert trip completions" ON trip_completions;
DROP POLICY IF EXISTS "Authenticated users can insert trip completions" ON trip_completions;
DROP POLICY IF EXISTS "Trip completions are immutable" ON trip_completions;
DROP POLICY IF EXISTS "Trip completions cannot be deleted" ON trip_completions;

-- Create policies for drivers
CREATE POLICY "Drivers can view own trip completions"
  ON trip_completions
  FOR SELECT
  TO authenticated
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Create policies for customers
CREATE POLICY "Customers can view own trip completions"
  ON trip_completions
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

-- Allow authenticated users to insert trip completions
CREATE POLICY "Authenticated users can insert trip completions"
  ON trip_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Prevent updates (immutable records)
CREATE POLICY "Trip completions are immutable"
  ON trip_completions
  FOR UPDATE
  TO authenticated
  USING (false);

-- Prevent deletes
CREATE POLICY "Trip completions cannot be deleted"
  ON trip_completions
  FOR DELETE
  TO authenticated
  USING (false);

-- Add comment
COMMENT ON TABLE trip_completions IS 'Stores comprehensive trip completion data with detailed fare breakdowns for all ride types. Accessible by both drivers and customers.';
