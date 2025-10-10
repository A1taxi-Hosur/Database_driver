/*
  # Cleanup expired ride requests

  1. Function to automatically mark expired ride requests as 'no_drivers_available'
  2. Trigger to run this cleanup periodically
*/

-- Function to cleanup expired ride requests (older than 3 minutes)
CREATE OR REPLACE FUNCTION cleanup_expired_rides()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update rides that are still 'requested' but older than 3 minutes
  UPDATE rides 
  SET 
    status = 'no_drivers_available',
    updated_at = now()
  WHERE 
    status = 'requested' 
    AND created_at < (now() - interval '3 minutes');
    
  -- Log the cleanup
  RAISE NOTICE 'Cleaned up expired ride requests older than 3 minutes';
END;
$$;

-- Create a function that can be called by a cron job or trigger
CREATE OR REPLACE FUNCTION schedule_cleanup_expired_rides()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM cleanup_expired_rides();
END;
$$;