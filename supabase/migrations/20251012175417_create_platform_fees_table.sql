/*
  # Create Platform Fees Table

  1. New Tables
    - `platform_fees`
      - `id` (uuid, primary key)
      - `booking_type` (text) - 'regular', 'rental', 'outstation', 'airport'
      - `fee_type` (text) - 'fixed' or 'percentage'
      - `fee_amount` (numeric) - Fixed amount or percentage value
      - `is_active` (boolean) - Whether this fee is currently active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `platform_fees` table
    - Add policy for authenticated users to read platform fees
    - Only admins can modify platform fees (handled by admin panel)
*/

CREATE TABLE IF NOT EXISTS platform_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_type text NOT NULL,
  fee_type text NOT NULL DEFAULT 'fixed',
  fee_amount numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE platform_fees ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active platform fees
CREATE POLICY "Anyone can read active platform fees"
  ON platform_fees
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_platform_fees_booking_type ON platform_fees(booking_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_platform_fees_active ON platform_fees(is_active) WHERE is_active = true;

-- Insert default platform fees
INSERT INTO platform_fees (booking_type, fee_type, fee_amount, is_active)
VALUES 
  ('regular', 'fixed', 10, true),
  ('rental', 'fixed', 20, true),
  ('outstation', 'fixed', 50, true),
  ('airport', 'fixed', 30, true)
ON CONFLICT DO NOTHING;