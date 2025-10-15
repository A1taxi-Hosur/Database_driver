/*
  # Create Trip Completion Tables for Rental, Outstation, and Airport Rides

  This migration creates three new tables to store trip completion data for different booking types.

  ## New Tables

  ### 1. `rental_trip_completions`
  Stores completion data for rental rides (hourly-based bookings)
  - Links to rides, drivers, and customers
  - Tracks actual hours used, distance traveled
  - Stores detailed fare breakdown including hourly charges
  - Includes driver and vehicle details for customer receipt

  ### 2. `outstation_trip_completions`
  Stores completion data for outstation rides (inter-city/long-distance)
  - Links to rides, drivers, and customers
  - Tracks actual distance, duration, and days
  - Stores detailed fare breakdown including per-day charges and driver allowance
  - Includes driver and vehicle details for customer receipt

  ### 3. `airport_trip_completions`
  Stores completion data for airport rides
  - Links to rides, drivers, and customers
  - Tracks actual distance and duration
  - Stores detailed fare breakdown including airport surcharge
  - Includes driver and vehicle details for customer receipt

  ## Security
  - RLS enabled on all tables
  - Policies allow authenticated users to read their own completion data
  - Admin/driver can insert completion records
*/

-- Create rental_trip_completions table
CREATE TABLE IF NOT EXISTS rental_trip_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Booking details
  booking_type text NOT NULL DEFAULT 'rental',
  vehicle_type text NOT NULL,
  trip_type text,

  -- Location details
  pickup_address text NOT NULL,
  destination_address text,

  -- Rental-specific details
  rental_hours integer NOT NULL,
  actual_hours_used numeric NOT NULL,
  actual_distance_km numeric NOT NULL,
  actual_duration_minutes integer NOT NULL,

  -- Fare breakdown
  base_fare numeric NOT NULL,
  hourly_charges numeric NOT NULL DEFAULT 0,
  distance_fare numeric NOT NULL DEFAULT 0,
  extra_km_charges numeric NOT NULL DEFAULT 0,
  extra_hour_charges numeric NOT NULL DEFAULT 0,
  platform_fee numeric NOT NULL DEFAULT 0,
  gst_on_charges numeric NOT NULL DEFAULT 0,
  gst_on_platform_fee numeric NOT NULL DEFAULT 0,
  total_fare numeric NOT NULL,

  -- Detailed fare information (JSON)
  fare_details jsonb,

  -- Driver and vehicle details (for customer receipt)
  driver_name text NOT NULL,
  driver_phone text,
  driver_rating numeric,
  vehicle_id uuid REFERENCES vehicles(id),
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  vehicle_license_plate text,

  -- Timestamps
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create outstation_trip_completions table
CREATE TABLE IF NOT EXISTS outstation_trip_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Booking details
  booking_type text NOT NULL DEFAULT 'outstation',
  vehicle_type text NOT NULL,
  trip_type text,

  -- Location details
  pickup_address text NOT NULL,
  destination_address text NOT NULL,

  -- Outstation-specific details
  scheduled_time timestamptz,
  actual_distance_km numeric NOT NULL,
  actual_duration_minutes integer NOT NULL,
  actual_days integer NOT NULL,

  -- Fare breakdown
  base_fare numeric NOT NULL,
  distance_fare numeric NOT NULL DEFAULT 0,
  per_day_charges numeric NOT NULL DEFAULT 0,
  driver_allowance numeric NOT NULL DEFAULT 0,
  extra_km_charges numeric NOT NULL DEFAULT 0,
  toll_charges numeric NOT NULL DEFAULT 0,
  platform_fee numeric NOT NULL DEFAULT 0,
  gst_on_charges numeric NOT NULL DEFAULT 0,
  gst_on_platform_fee numeric NOT NULL DEFAULT 0,
  total_fare numeric NOT NULL,

  -- Detailed fare information (JSON)
  fare_details jsonb,

  -- Driver and vehicle details (for customer receipt)
  driver_name text NOT NULL,
  driver_phone text,
  driver_rating numeric,
  vehicle_id uuid REFERENCES vehicles(id),
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  vehicle_license_plate text,

  -- Timestamps
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create airport_trip_completions table
CREATE TABLE IF NOT EXISTS airport_trip_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Booking details
  booking_type text NOT NULL DEFAULT 'airport',
  vehicle_type text NOT NULL,
  trip_type text,

  -- Location details
  pickup_address text NOT NULL,
  destination_address text NOT NULL,

  -- Airport-specific details
  scheduled_time timestamptz,
  actual_distance_km numeric NOT NULL,
  actual_duration_minutes integer NOT NULL,

  -- Fare breakdown
  base_fare numeric NOT NULL,
  distance_fare numeric NOT NULL DEFAULT 0,
  airport_surcharge numeric NOT NULL DEFAULT 0,
  time_fare numeric NOT NULL DEFAULT 0,
  platform_fee numeric NOT NULL DEFAULT 0,
  gst_on_charges numeric NOT NULL DEFAULT 0,
  gst_on_platform_fee numeric NOT NULL DEFAULT 0,
  total_fare numeric NOT NULL,

  -- Detailed fare information (JSON)
  fare_details jsonb,

  -- Driver and vehicle details (for customer receipt)
  driver_name text NOT NULL,
  driver_phone text,
  driver_rating numeric,
  vehicle_id uuid REFERENCES vehicles(id),
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  vehicle_license_plate text,

  -- Timestamps
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE rental_trip_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outstation_trip_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE airport_trip_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rental_trip_completions
CREATE POLICY "Users can view own rental completions"
  ON rental_trip_completions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = customer_id OR
    auth.uid() IN (SELECT user_id FROM drivers WHERE id = driver_id)
  );

CREATE POLICY "Drivers can insert rental completions"
  ON rental_trip_completions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM drivers WHERE id = driver_id)
  );

-- RLS Policies for outstation_trip_completions
CREATE POLICY "Users can view own outstation completions"
  ON outstation_trip_completions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = customer_id OR
    auth.uid() IN (SELECT user_id FROM drivers WHERE id = driver_id)
  );

CREATE POLICY "Drivers can insert outstation completions"
  ON outstation_trip_completions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM drivers WHERE id = driver_id)
  );

-- RLS Policies for airport_trip_completions
CREATE POLICY "Users can view own airport completions"
  ON airport_trip_completions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = customer_id OR
    auth.uid() IN (SELECT user_id FROM drivers WHERE id = driver_id)
  );

CREATE POLICY "Drivers can insert airport completions"
  ON airport_trip_completions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM drivers WHERE id = driver_id)
  );

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_rental_completions_ride_id ON rental_trip_completions(ride_id);
CREATE INDEX IF NOT EXISTS idx_rental_completions_driver_id ON rental_trip_completions(driver_id);
CREATE INDEX IF NOT EXISTS idx_rental_completions_customer_id ON rental_trip_completions(customer_id);
CREATE INDEX IF NOT EXISTS idx_rental_completions_completed_at ON rental_trip_completions(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_outstation_completions_ride_id ON outstation_trip_completions(ride_id);
CREATE INDEX IF NOT EXISTS idx_outstation_completions_driver_id ON outstation_trip_completions(driver_id);
CREATE INDEX IF NOT EXISTS idx_outstation_completions_customer_id ON outstation_trip_completions(customer_id);
CREATE INDEX IF NOT EXISTS idx_outstation_completions_completed_at ON outstation_trip_completions(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_airport_completions_ride_id ON airport_trip_completions(ride_id);
CREATE INDEX IF NOT EXISTS idx_airport_completions_driver_id ON airport_trip_completions(driver_id);
CREATE INDEX IF NOT EXISTS idx_airport_completions_customer_id ON airport_trip_completions(customer_id);
CREATE INDEX IF NOT EXISTS idx_airport_completions_completed_at ON airport_trip_completions(completed_at DESC);
