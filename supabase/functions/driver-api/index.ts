const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

import { createClient } from "npm:@supabase/supabase-js@2";

interface Database {
  public: {
    Tables: {
      rides: {
        Row: {
          id: string
          customer_id: string
          driver_id: string | null
          pickup_latitude: number
          pickup_longitude: number
          pickup_address: string
          destination_address: string
          booking_type: string
          vehicle_type: string
          fare_amount: number
          status: string
          created_at: string
          scheduled_time: string | null
        }
        Insert: {
          customer_id: string
          ride_code: string
          pickup_latitude: number
          pickup_longitude: number
          pickup_address: string
          destination_address: string
          booking_type?: string
          vehicle_type?: string
          fare_amount?: number
          status?: string
          scheduled_time?: string | null
        }
      }
      drivers: {
        Row: {
          id: string
          user_id: string
          status: string
          vehicle_id: string
          is_verified: boolean
        }
      }
      live_locations: {
        Row: {
          user_id: string
          latitude: number
          longitude: number
          updated_at: string
        }
      }
      notifications: {
        Insert: {
          user_id: string
          type: string
          title: string
          message: string
          data?: any
        }
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const url = new URL(req.url);
    const path = url.pathname;

    console.log('Driver API called:', path, req.method);

    if (path.includes('/notify-drivers') && req.method === 'POST') {
      return await handleNotifyDrivers(supabase, req);
    }

    if (path.includes('/accept-ride') && req.method === 'POST') {
      return await handleAcceptRide(supabase, req);
    }

    if (path.includes('/update-ride-status') && req.method === 'POST') {
      return await handleUpdateRideStatus(supabase, req);
    }

    if (path.includes('/get-nearby-rides') && req.method === 'GET') {
      return await handleGetNearbyRides(supabase, req);
    }

    return new Response(
      JSON.stringify({ error: 'Endpoint not found' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      },
    );

  } catch (error) {
    console.error('API error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

async function handleNotifyDrivers(supabase: any, req: Request) {
  try {
    console.log('=== NOTIFY DRIVERS FUNCTION CALLED ===');
    const body = await req.json();
    console.log('Request body:', JSON.stringify(body, null, 2));

    const { ride_id } = body;

    if (!ride_id) {
      console.log('❌ Missing ride_id in request');
      return new Response(
        JSON.stringify({ error: 'ride_id is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select(`
        *,
        customer:users!rides_customer_id_fkey(
          id,
          full_name,
          phone_number,
          email
        )
      `)
      .eq('id', ride_id)
      .single();

    if (rideError || !ride) {
      console.error('❌ Error fetching ride:', rideError);
      return new Response(
        JSON.stringify({ error: 'Ride not found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        },
      );
    }

    console.log('🚗 Ride vehicle type:', ride.vehicle_type);

    if (ride.status !== 'requested') {
      return new Response(
        JSON.stringify({ success: true, message: 'Ride not in requested status' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    const nearbyDrivers = await findNearbyDrivers(
      supabase,
      ride.pickup_latitude,
      ride.pickup_longitude,
      ride.vehicle_type,
      15
    );

    console.log(`Found ${nearbyDrivers.length} nearby drivers with matching vehicle type: ${ride.vehicle_type}`);

    if (nearbyDrivers.length === 0) {
      await supabase
        .from('rides')
        .update({ status: 'no_drivers_available' })
        .eq('id', ride.id);

      return new Response(
        JSON.stringify({ success: true, message: 'No drivers available' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    let notificationsCreated = 0;

    for (const driver of nearbyDrivers) {
      const notificationSent = await sendDriverNotification(supabase, driver, ride);
      if (notificationSent) {
        notificationsCreated++;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (notificationsCreated === 0) {
      await supabase
        .from('rides')
        .update({ status: 'no_drivers_available' })
        .eq('id', ride.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        drivers_found: nearbyDrivers.length,
        notifications_sent: notificationsCreated
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error notifying drivers:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

async function handleAcceptRide(supabase: any, req: Request) {
  try {
    console.log('=== ACCEPT RIDE EDGE FUNCTION CALLED ===')
    const body = await req.json();
    const { ride_id, driver_id } = body;

    console.log('Request data:', { ride_id, driver_id })

    if (!ride_id || !driver_id) {
      console.log('❌ Missing required parameters')
      return new Response(
        JSON.stringify({ error: 'ride_id and driver_id are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    console.log('📝 Attempting to accept ride in database...')
    console.log('Ride ID:', ride_id)
    console.log('Driver ID:', driver_id)

    const { data: updatedRide, error } = await supabase
      .from('rides')
      .update({
        driver_id,
        status: 'accepted',
        updated_at: new Date().toISOString()
      })
      .eq('id', ride_id)
      .eq('status', 'requested')
      .is('driver_id', null)
      .select()
      .single();

    if (error) {
      console.error('Error accepting ride:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Database error: ${error.message}`
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    if (!updatedRide) {
      console.log('❌ Ride already assigned to another driver or status changed')
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Ride already assigned to another driver or no longer available'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        },
      );
    }

    console.log('✅ Ride accepted successfully in database')
    console.log('Updated ride status:', updatedRide.status)
    console.log('Assigned driver:', updatedRide.driver_id)

    const { error: driverError } = await supabase
      .from('drivers')
      .update({ status: 'busy' })
      .eq('id', driver_id);

    if (driverError) {
      console.error('⚠️ Error updating driver status:', driverError)
    } else {
      console.log('✅ Driver status updated to busy')
    }

    console.log('📝 Marking all ride notifications as read for other drivers...')
    const { data: updatedNotifications, error: notificationError } = await supabase
      .from('notifications')
      .update({ status: 'read' })
      .eq('type', 'ride_request')
      .eq('status', 'unread')
      .contains('data', { ride_id: ride_id })
      .select('id, user_id');

    if (notificationError) {
      console.error('⚠️ Error marking notifications as read:', notificationError)
    } else {
      console.log(`✅ Marked ${updatedNotifications?.length || 0} notifications as read`)
      updatedNotifications?.forEach(notif => {
        console.log(`   - Notification ${notif.id} for user ${notif.user_id}`)
      })
    }

    return new Response(
      JSON.stringify({ success: true, ride: updatedRide }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error accepting ride:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

async function handleUpdateRideStatus(supabase: any, req: Request) {
  try {
    const body = await req.json();
    const { ride_id, status, driver_id } = body;

    if (!ride_id || !status) {
      return new Response(
        JSON.stringify({ error: 'ride_id and status are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    const { data: updatedRide, error } = await supabase
      .from('rides')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', ride_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating ride status:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update ride status' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    if ((status === 'completed' || status === 'cancelled') && driver_id) {
      await supabase
        .from('drivers')
        .update({ status: 'online' })
        .eq('id', driver_id);
    }

    return new Response(
      JSON.stringify({ success: true, ride: updatedRide }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error updating ride status:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

async function handleGetNearbyRides(supabase: any, req: Request) {
  try {
    const url = new URL(req.url);
    const driver_user_id = url.searchParams.get('driver_user_id');
    const latitude = parseFloat(url.searchParams.get('latitude') || '0');
    const longitude = parseFloat(url.searchParams.get('longitude') || '0');

    if (!driver_user_id || !latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: 'driver_user_id, latitude, and longitude are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    const { data: pendingRides, error } = await supabase
      .from('rides')
      .select(`
        *,
        customer:users!rides_customer_id_fkey(
          id,
          full_name,
          phone_number,
          email
        )
      `)
      .eq('status', 'requested')
      .eq('booking_type', 'regular')
      .is('driver_id', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching rides:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rides' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    const nearbyRides = (pendingRides || []).filter(ride => {
      const distance = calculateDistance(
        latitude,
        longitude,
        ride.pickup_latitude,
        ride.pickup_longitude
      );
      return distance <= 10;
    });

    return new Response(
      JSON.stringify({
        success: true,
        rides: nearbyRides,
        count: nearbyRides.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error getting nearby rides:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}

async function findNearbyDrivers(
  supabase: any,
  pickupLat: number,
  pickupLng: number,
  vehicleType: string,
  radiusKm: number
) {
  try {
    console.log('=== FINDING NEARBY DRIVERS WITH VEHICLE TYPE FILTER ===');
    console.log('Required vehicle type:', vehicleType);

    const { data: drivers, error } = await supabase
      .from('drivers')
      .select(`
        id,
        user_id,
        status,
        vehicle_id,
        is_verified,
        rating,
        total_rides,
        vehicles!fk_drivers_vehicle(
          id,
          vehicle_type,
          make,
          model,
          registration_number
        )
      `)
      .eq('status', 'online')
      .eq('is_verified', true);

    if (error || !drivers || drivers.length === 0) {
      return [];
    }

    console.log(`Found ${drivers.length} online drivers, filtering by vehicle type...`);

    const driverUserIds = drivers.map(d => d.user_id);

    const { data: locations, error: locationError } = await supabase
      .from('live_locations')
      .select('user_id, latitude, longitude, updated_at')
      .in('user_id', driverUserIds)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (locationError) {
      return [];
    }

    const latestLocations = new Map();
    locations?.forEach(loc => {
      const existingLocation = latestLocations.get(loc.user_id);
      if (!existingLocation || new Date(loc.updated_at) > new Date(existingLocation.updated_at)) {
        latestLocations.set(loc.user_id, loc);
      }
    });

    const nearbyDrivers = drivers.filter(driver => {
      // Check vehicle type match - include AC variants
      const driverVehicleType = driver.vehicles?.vehicle_type;

      if (!driverVehicleType) {
        console.log(`❌ Driver ${driver.user_id} has no vehicle type`);
        return false;
      }

      // Check if driver's vehicle type matches the requested type or its AC variant
      // Example: if "sedan" is requested, match both "sedan" and "sedan_ac"
      const vehicleTypeMatches =
        driverVehicleType === vehicleType ||
        driverVehicleType === `${vehicleType}_ac`;

      if (!vehicleTypeMatches) {
        console.log(`❌ Driver ${driver.user_id} vehicle type mismatch: has ${driverVehicleType}, needs ${vehicleType} or ${vehicleType}_ac`);
        return false;
      }

      console.log(`✅ Driver ${driver.user_id} vehicle type matched: has ${driverVehicleType}, requested ${vehicleType}`);

      const location = latestLocations.get(driver.user_id);
      if (!location) {
        return false;
      }

      const locationAge = Date.now() - new Date(location.updated_at).getTime();
      if (locationAge > 30 * 60 * 1000) {
        return false;
      }

      const distance = calculateDistance(
        pickupLat,
        pickupLng,
        location.latitude,
        location.longitude
      );

      if (distance <= radiusKm) {
        console.log(`✅ Driver ${driver.user_id} matched: ${driverVehicleType}, ${distance.toFixed(1)}km away`);
        return true;
      }

      return false;
    });

    console.log(`✅ Final result: ${nearbyDrivers.length} drivers with matching vehicle type ${vehicleType}`);

    return nearbyDrivers.map(driver => ({
      ...driver,
      location: latestLocations.get(driver.user_id)
    }));

  } catch (error) {
    console.error('Error finding nearby drivers:', error);
    return [];
  }
}

async function sendDriverNotification(supabase: any, driver: any, ride: any): Promise<boolean> {
  try {
    const distance = calculateDistance(
      ride.pickup_latitude,
      ride.pickup_longitude,
      driver.location.latitude,
      driver.location.longitude
    );

    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .insert({
        user_id: driver.user_id,
        type: 'ride_request',
        title: 'New Ride Request',
        message: `Customer needs a ride from ${ride.pickup_address} to ${ride.destination_address} (${distance.toFixed(1)}km away)`,
        status: 'unread',
        data: {
          ride_id: ride.id,
          ride_code: ride.ride_code,
          pickup_address: ride.pickup_address,
          destination_address: ride.destination_address,
          fare_amount: ride.fare_amount,
          booking_type: ride.booking_type,
          vehicle_type: ride.vehicle_type,
          distance: distance.toFixed(1),
          pickup_latitude: ride.pickup_latitude,
          pickup_longitude: ride.pickup_longitude,
          destination_latitude: ride.destination_latitude,
          destination_longitude: ride.destination_longitude,
          customer_id: ride.customer_id,
          customer_name: ride.customer?.full_name,
          customer_phone: ride.customer?.phone_number,
          created_at: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          notification_id: crypto.randomUUID()
        }
      })
      .select()
      .single();

    if (notificationError) {
      console.error('❌ Error creating notification:', notificationError);
      return false;
    }

    return true;

  } catch (error) {
    console.error('❌ Error sending driver notification:', error);
    return false;
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
