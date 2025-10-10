/*
  # Trip Completions Table

  1. New Tables
    - `trip_completions`
      - `id` (uuid, primary key)
      - `ride_id` (uuid, foreign key to rides table)
      - `booking_type` (text, type of booking)
      - `vehicle_type` (text, vehicle category)
      - `actual_distance_km` (numeric, actual distance traveled)
      - `actual_duration_minutes` (integer, actual trip duration)
      - `base_fare` (numeric, base fare amount)
      - `distance_fare` (numeric, distance-based charges)
      - `time_fare` (numeric, time-based charges)
      - `surge_charges` (numeric, surge pricing charges)
      - `deadhead_charges` (numeric, deadhead return charges)
      - `platform_fee` (numeric, platform commission)
      - `extra_km_charges` (numeric, extra km charges for rental/outstation)
      - `driver_allowance` (numeric, driver allowance for outstation)
      - `total_fare` (numeric, final calculated fare)
      - `fare_breakdown` (jsonb, detailed calculation breakdown)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `trip_completions` table
    - Add policies for drivers to read their own trip completions
    - Add policies for admins to read all trip completions

  3. Indexes
    - Index on ride_id for fast lookups
    - Index on booking_type for analytics
    - Index on created_at for chronological queries
*/

CREATE TABLE IF NOT EXISTS trip_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  booking_type text NOT NULL CHECK (booking_type IN ('regular', 'rental', 'outstation', 'airport')),
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('hatchback', 'hatchback_ac', 'sedan', 'sedan_ac', 'suv', 'suv_ac')),
  actual_distance_km numeric(8,2) NOT NULL CHECK (actual_distance_km >= 0),
  actual_duration_minutes integer NOT NULL CHECK (actual_duration_minutes >= 0),
  base_fare numeric(10,2) NOT NULL DEFAULT 0 CHECK (base_fare >= 0),
  distance_fare numeric(10,2) NOT NULL DEFAULT 0 CHECK (distance_fare >= 0),
  time_fare numeric(10,2) NOT NULL DEFAULT 0 CHECK (time_fare >= 0),
  surge_charges numeric(10,2) NOT NULL DEFAULT 0 CHECK (surge_charges >= 0),
  deadhead_charges numeric(10,2) NOT NULL DEFAULT 0 CHECK (deadhead_charges >= 0),
  platform_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  extra_km_charges numeric(10,2) NOT NULL DEFAULT 0 CHECK (extra_km_charges >= 0),
  driver_allowance numeric(10,2) NOT NULL DEFAULT 0 CHECK (driver_allowance >= 0),
  total_fare numeric(10,2) NOT NULL CHECK (total_fare >= 0),
  fare_breakdown jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_completions_ride_id ON trip_completions(ride_id);
CREATE INDEX IF NOT EXISTS idx_trip_completions_booking_type ON trip_completions(booking_type);
CREATE INDEX IF NOT EXISTS idx_trip_completions_created_at ON trip_completions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_completions_vehicle_type ON trip_completions(vehicle_type);

-- Enable Row Level Security
ALTER TABLE trip_completions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Drivers can read their own trip completions"
  ON trip_completions
  FOR SELECT
  TO authenticated
  USING (
    ride_id IN (
      SELECT rides.id 
      FROM rides 
      INNER JOIN drivers ON rides.driver_id = drivers.id 
      WHERE drivers.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all trip completions"
  ON trip_completions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "System can insert trip completions"
  ON trip_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_trip_completions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trip_completions_updated_at
  BEFORE UPDATE ON trip_completions
  FOR EACH ROW
  EXECUTE FUNCTION update_trip_completions_updated_at();