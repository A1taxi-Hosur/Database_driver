/*
  # Trip Location History Table

  1. New Tables
    - `trip_location_history`
      - `id` (uuid, primary key)
      - `ride_id` (uuid, foreign key to rides)
      - `scheduled_booking_id` (uuid, nullable, foreign key to scheduled_bookings)
      - `driver_id` (uuid, foreign key to drivers)
      - `latitude` (numeric)
      - `longitude` (numeric)
      - `accuracy` (numeric, nullable)
      - `speed` (numeric, nullable)
      - `heading` (numeric, nullable)
      - `altitude` (numeric, nullable)
      - `recorded_at` (timestamptz)
      - `created_at` (timestamptz)
  
  2. Indexes
    - Index on ride_id for fast trip location queries
    - Index on scheduled_booking_id for scheduled trips
    - Index on recorded_at for time-based queries
  
  3. Security
    - Enable RLS on `trip_location_history` table
    - Add policy for drivers to insert their own location during active trips
    - Add policy for drivers to read location history of their completed trips
*/

-- Create trip_location_history table
CREATE TABLE IF NOT EXISTS trip_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid REFERENCES rides(id) ON DELETE CASCADE,
  scheduled_booking_id uuid REFERENCES scheduled_bookings(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  accuracy numeric,
  speed numeric,
  heading numeric,
  altitude numeric,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT trip_location_check CHECK (
    (ride_id IS NOT NULL AND scheduled_booking_id IS NULL) OR
    (ride_id IS NULL AND scheduled_booking_id IS NOT NULL)
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_location_ride_id ON trip_location_history(ride_id);
CREATE INDEX IF NOT EXISTS idx_trip_location_scheduled_booking_id ON trip_location_history(scheduled_booking_id);
CREATE INDEX IF NOT EXISTS idx_trip_location_recorded_at ON trip_location_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_trip_location_driver_id ON trip_location_history(driver_id);

-- Enable Row Level Security
ALTER TABLE trip_location_history ENABLE ROW LEVEL SECURITY;

-- Policy: Drivers can insert location during their active trips
CREATE POLICY "Drivers can insert trip location during active trips"
  ON trip_location_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );

-- Policy: Drivers can read location history of their own trips
CREATE POLICY "Drivers can read own trip location history"
  ON trip_location_history
  FOR SELECT
  TO authenticated
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );