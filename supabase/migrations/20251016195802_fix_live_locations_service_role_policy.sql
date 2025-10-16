/*
  # Fix Service Role Permissions for Live Locations

  ## Changes
  1. Add INSERT and UPDATE policies for service_role on live_locations table
     - This allows edge functions to update driver locations
     - Service role needs full write access to manage real-time location updates
  
  ## Security
  - Service role policies allow edge functions to insert/update any location
  - Authenticated users can still only manage their own locations
  - This is required for the update-driver-location edge function to work
*/

-- Drop existing service role SELECT-only policies
DROP POLICY IF EXISTS "Service role can read all live locations" ON live_locations;
DROP POLICY IF EXISTS "Service role can read all live locations for edge functions" ON live_locations;

-- Create comprehensive service role policy for all operations
CREATE POLICY "Service role has full access to live locations"
  ON live_locations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
