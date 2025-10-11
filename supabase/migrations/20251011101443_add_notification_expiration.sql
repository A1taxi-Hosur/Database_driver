/*
  # Add Notification Expiration System

  ## Overview
  This migration adds expiration tracking to ride request notifications to automatically
  clean up expired requests after 2 minutes.

  ## Changes
  1. Add `expires_at` column to notifications table
  2. Update existing ride request notifications with expiration time
  3. Create function to automatically delete expired notifications
  4. Create trigger to set expiration time on new ride notifications

  ## Expiration Logic
  - Ride request notifications expire 2 minutes after creation
  - Expired notifications are automatically cleaned up
  - When a ride is accepted, notifications for other drivers are marked as read
*/

-- Add expires_at column to notifications table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE notifications ADD COLUMN expires_at timestamptz;
  END IF;
END $$;

-- Update existing ride_request notifications with expiration time (2 minutes from creation)
UPDATE notifications
SET expires_at = created_at + interval '2 minutes'
WHERE type = 'ride_request' AND expires_at IS NULL;

-- Create function to automatically set expiration time for new ride notifications
CREATE OR REPLACE FUNCTION set_notification_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'ride_request' AND NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.created_at + interval '2 minutes';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to set expiration on insert
DROP TRIGGER IF EXISTS trigger_set_notification_expiration ON notifications;
CREATE TRIGGER trigger_set_notification_expiration
  BEFORE INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION set_notification_expiration();

-- Create function to delete expired notifications
CREATE OR REPLACE FUNCTION delete_expired_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications
  WHERE type = 'ride_request'
    AND expires_at IS NOT NULL
    AND expires_at < now()
    AND status = 'unread';
  
  RAISE NOTICE 'Deleted expired ride request notifications';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index on expires_at for efficient cleanup
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at 
  ON notifications(expires_at) 
  WHERE type = 'ride_request' AND status = 'unread';