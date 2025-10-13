/*
  # Fix Proximity Notification to Filter by Vehicle Type

  ## Problem
  The proximity_notification_trigger was notifying all online drivers regardless of their vehicle type.
  This caused:
  - Hatchback drivers to receive all ride requests (sedan, suv, etc.)
  - Sedan/SUV drivers to NOT receive their matching ride requests
  
  ## Solution
  Update the `notify_nearby_drivers` function to:
  1. Join with the vehicles table to get driver's vehicle type
  2. Match driver's vehicle type with ride's requested vehicle type
  3. Support both base types (e.g., "sedan") and AC variants (e.g., "sedan_ac")
  
  ## Changes
  - Modified notify_nearby_drivers() function to include vehicle type filtering
  - Drivers with "sedan" can accept "sedan" rides
  - Drivers with "sedan_ac" can accept "sedan" rides (AC variant can take non-AC requests)
*/

-- Drop and recreate the function with vehicle type filtering
DROP FUNCTION IF EXISTS notify_nearby_drivers() CASCADE;

CREATE OR REPLACE FUNCTION notify_nearby_drivers() 
RETURNS TRIGGER AS $$
DECLARE
  nearby_driver RECORD;
  distance_km NUMERIC;
  max_distance NUMERIC := 15.0; -- 15km radius (increased from 5km)
BEGIN
  -- Only process new ride requests
  IF NEW.status = 'requested' AND OLD IS NULL THEN
    
    -- Only notify drivers for regular rides (rental/outstation/airport are admin-assigned)
    IF NEW.booking_type != 'regular' THEN
      RETURN NEW;
    END IF;
    
    -- Find online drivers within proximity with matching vehicle type
    FOR nearby_driver IN
      SELECT 
        d.id as driver_id,
        d.user_id,
        ll.latitude as driver_lat,
        ll.longitude as driver_lng,
        v.vehicle_type,
        u.full_name as driver_name
      FROM drivers d
      JOIN live_locations ll ON ll.user_id = d.user_id
      JOIN vehicles v ON d.vehicle_id = v.id
      JOIN users u ON d.user_id = u.id
      WHERE d.status = 'online' 
        AND d.is_verified = true
        AND ll.updated_at > NOW() - INTERVAL '30 minutes' -- Recent location data
        AND (
          -- Exact match: driver has exact vehicle type requested
          v.vehicle_type = NEW.vehicle_type
          OR
          -- AC variant match: driver with AC vehicle can take non-AC requests
          v.vehicle_type = NEW.vehicle_type || '_ac'
        )
    LOOP
      -- Calculate distance between driver and pickup
      distance_km := calculate_distance(
        nearby_driver.driver_lat, 
        nearby_driver.driver_lng,
        NEW.pickup_latitude, 
        NEW.pickup_longitude
      );
      
      -- If driver is within range, send notification
      IF distance_km <= max_distance THEN
        -- Insert notification for the driver
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message,
          data
        ) VALUES (
          nearby_driver.user_id,
          'new_ride_request',
          'New Ride Request Nearby!',
          'Pickup: ' || NEW.pickup_address || ' (' || ROUND(distance_km, 1) || 'km away)',
          jsonb_build_object(
            'ride_id', NEW.id,
            'distance_km', ROUND(distance_km, 1),
            'pickup_address', NEW.pickup_address,
            'destination_address', NEW.destination_address,
            'fare_amount', NEW.fare_amount,
            'vehicle_type', NEW.vehicle_type,
            'booking_type', NEW.booking_type,
            'driver_vehicle_type', nearby_driver.vehicle_type
          )
        );
        
        -- Log for debugging
        RAISE NOTICE 'Notified driver % (%) for ride % - Vehicle: % matches %, Distance: %km',
          nearby_driver.driver_name,
          nearby_driver.user_id,
          NEW.id,
          nearby_driver.vehicle_type,
          NEW.vehicle_type,
          ROUND(distance_km, 1);
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS proximity_notification_trigger ON rides;
CREATE TRIGGER proximity_notification_trigger
  AFTER INSERT ON rides
  FOR EACH ROW
  EXECUTE FUNCTION notify_nearby_drivers();
