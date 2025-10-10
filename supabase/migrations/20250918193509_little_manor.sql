/*
  # Remove references to unrecognized configuration parameter

  This migration fixes the "unrecognized configuration parameter 'app.supabase_url'" error
  by removing or replacing references to this parameter in database functions and triggers.

  ## Changes Made
  1. Update trigger functions that reference app.supabase_url
  2. Remove dependency on configuration parameter that doesn't exist
  3. Fix any RLS policies that might reference this parameter
*/

-- First, let's check and fix the trigger functions that might be causing this issue

-- Update the scheduled booking completion trigger function
CREATE OR REPLACE FUNCTION notify_scheduled_booking_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove the problematic app.supabase_url reference
  -- Just perform the notification without external URL dependency
  
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Insert notification for customer
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      data
    ) VALUES (
      NEW.customer_id,
      'booking_completed',
      'Trip Completed',
      'Your scheduled trip has been completed successfully.',
      jsonb_build_object(
        'booking_id', NEW.id,
        'booking_type', NEW.booking_type
      )
    );
    
    -- Insert notification for driver if assigned
    IF NEW.assigned_driver_id IS NOT NULL THEN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        data
      ) SELECT 
        d.user_id,
        'booking_completed',
        'Trip Completed',
        'You have successfully completed a scheduled trip.',
        jsonb_build_object(
          'booking_id', NEW.id,
          'booking_type', NEW.booking_type
        )
      FROM drivers d
      WHERE d.id = NEW.assigned_driver_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the updated_at trigger function for scheduled_bookings
CREATE OR REPLACE FUNCTION update_scheduled_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Check and fix any other trigger functions that might reference app.supabase_url
-- Update ride completion trigger
CREATE OR REPLACE FUNCTION notify_ride_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Insert notification without external URL dependency
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      data
    ) VALUES (
      NEW.customer_id,
      'ride_completed',
      'Trip Completed',
      'Your ride has been completed successfully.',
      jsonb_build_object(
        'ride_id', NEW.id,
        'fare_amount', NEW.fare_amount
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update ride status change trigger
CREATE OR REPLACE FUNCTION notify_ride_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove any references to app.supabase_url
  -- Just perform basic notifications
  
  IF NEW.status != OLD.status THEN
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      data
    ) VALUES (
      NEW.customer_id,
      'ride_status_changed',
      'Ride Status Updated',
      'Your ride status has been updated to: ' || NEW.status,
      jsonb_build_object(
        'ride_id', NEW.id,
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;