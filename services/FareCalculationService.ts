import { supabaseAdmin } from '../utils/supabase';
import { calculateDistance } from '../utils/maps';

export interface FareBreakdown {
  booking_type: string;
  vehicle_type: string;
  base_fare: number;
  distance_fare: number;
  time_fare: number;
  surge_charges: number;
  deadhead_charges: number;
  platform_fee: number;
  gst_on_charges: number;
  gst_on_platform_fee: number;
  extra_km_charges: number;
  driver_allowance: number;
  total_fare: number;
  details: {
    actual_distance_km: number;
    actual_duration_minutes: number;
    base_km_included?: number;
    extra_km?: number;
    per_km_rate: number;
    per_minute_rate?: number;
    surge_multiplier?: number;
    platform_fee_flat?: number;
    gst_rate_charges?: number;
    gst_rate_platform?: number;
    zone_detected?: string;
    is_inner_zone?: boolean;
    days_calculated?: number;
    daily_km_limit?: number;
    within_allowance?: boolean;
    package_name?: string;
    total_km_travelled?: number;
    km_allowance?: number;
    direction?: string;
  };
}

export class FareCalculationService {
  /**
   * Calculate fare for completed trip and store in trip_completions table
   */
  static async calculateAndStoreTripFare(
    rideId: string,
    actualDistanceKm: number,
    actualDurationMinutes: number,
    pickupLat: number,
    pickupLng: number,
    dropLat: number,
    dropLng: number
  ): Promise<{ success: boolean; fareBreakdown?: FareBreakdown; error?: string }> {
    try {
      console.log('=== CALCULATING TRIP FARE ===');
      console.log('Ride ID:', rideId);
      console.log('Actual Distance:', actualDistanceKm, 'km');
      console.log('Actual Duration:', actualDurationMinutes, 'minutes');

      // Get ride details
      const { data: ride, error: rideError } = await supabaseAdmin
        .from('rides')
        .select('*')
        .eq('id', rideId)
        .single();

      if (rideError || !ride) {
        console.error('Error fetching ride:', rideError);
        return { success: false, error: 'Ride not found' };
      }

      console.log('Ride details:', {
        booking_type: ride.booking_type,
        vehicle_type: ride.vehicle_type,
        scheduled_time: ride.scheduled_time,
        trip_type: ride.trip_type
      });

      // Get zones from database
      console.log('🔍 Fetching zones from database...');
      const { data: zones, error: zonesError } = await supabaseAdmin
        .from('zones')
        .select('*')
        .eq('is_active', true);

      if (zonesError) {
        console.error('Error fetching zones:', zonesError);
        throw new Error('Failed to fetch zone configuration');
      }

      console.log('✅ Zones fetched:', zones?.length || 0);
      zones?.forEach(zone => {
        console.log(`Zone: ${zone.name} - Center: ${zone.center_latitude}, ${zone.center_longitude} - Radius: ${zone.radius_km}km`);
      });
      let fareBreakdown: FareBreakdown;

      // Calculate fare based on booking type
      switch (ride.booking_type) {
        case 'regular':
          fareBreakdown = await this.calculateRegularFare(
            ride.vehicle_type,
            actualDistanceKm,
            actualDurationMinutes,
            pickupLat,
            pickupLng,
            dropLat,
            dropLng,
            zones
          );
          break;

        case 'rental':
          fareBreakdown = await this.calculateRentalFare(
            ride.vehicle_type,
            actualDistanceKm,
            actualDurationMinutes,
            ride.selected_hours || 4
          );
          break;

        case 'outstation':
          fareBreakdown = await this.calculateOutstationFare(
            ride.vehicle_type,
            actualDistanceKm,
            actualDurationMinutes,
            ride.scheduled_time,
            ride.trip_type || 'round_trip'
          );
          break;

        case 'airport':
          fareBreakdown = await this.calculateAirportFare(
            ride.vehicle_type,
            pickupLat,
            pickupLng,
            dropLat,
            dropLng
          );
          break;

        default:
          return { success: false, error: 'Invalid booking type' };
      }

      // Store trip completion record
      const { data: tripCompletion, error: completionError } = await supabaseAdmin
        .from('trip_completions')
        .insert({
          ride_id: rideId,
          booking_type: ride.booking_type,
          vehicle_type: ride.vehicle_type,
          actual_distance_km: actualDistanceKm,
          actual_duration_minutes: actualDurationMinutes,
          base_fare: fareBreakdown.base_fare,
          distance_fare: fareBreakdown.distance_fare,
          time_fare: fareBreakdown.time_fare,
          surge_charges: fareBreakdown.surge_charges,
          deadhead_charges: fareBreakdown.deadhead_charges,
          platform_fee: fareBreakdown.platform_fee,
          extra_km_charges: fareBreakdown.extra_km_charges,
          driver_allowance: fareBreakdown.driver_allowance,
          total_fare: fareBreakdown.total_fare,
          fare_breakdown: fareBreakdown
        })
        .select()
        .single();

      if (completionError) {
        console.error('Error storing trip completion:', completionError);
        return { success: false, error: 'Failed to store trip completion' };
      }

      // Update ride with final fare
      await supabaseAdmin
        .from('rides')
        .update({
          fare_amount: fareBreakdown.total_fare,
          distance_km: actualDistanceKm,
          duration_minutes: actualDurationMinutes
        })
        .eq('id', rideId);

      console.log('✅ Trip fare calculated and stored successfully');
      return { success: true, fareBreakdown };

    } catch (error) {
      console.error('Exception calculating trip fare:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Regular ride fare calculation
   */
  private static async calculateRegularFare(
    vehicleType: string,
    actualDistanceKm: number,
    actualDurationMinutes: number,
    pickupLat: number,
    pickupLng: number,
    dropLat: number,
    dropLng: number,
    zones: any[]
  ): Promise<FareBreakdown> {
    console.log('=== CALCULATING REGULAR FARE ===');
    console.log('Vehicle Type:', vehicleType);
    console.log('Actual Distance:', actualDistanceKm, 'km');
    console.log('Actual Duration:', actualDurationMinutes, 'minutes');
    console.log('Zones parameter received:', {
      isArray: Array.isArray(zones),
      length: zones?.length || 0,
      zones: zones
    });

    // Debug: Check what we're searching for
    console.log('=== FARE MATRIX QUERY DEBUG ===');
    console.log('Searching for fare matrix with:');
    console.log('- booking_type:', 'regular');
    console.log('- vehicle_type:', vehicleType);
    console.log('- is_active:', true);

    // Get fare matrix for regular rides
    console.log('🔍 Fetching fare matrix for regular rides...');
    
    // First, let's see ALL fare matrix records for debugging
    console.log('=== DEBUGGING: FETCHING ALL FARE MATRIX RECORDS ===');
    const { data: allFareMatrices, error: allError } = await supabaseAdmin
      .from('fare_matrix')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (allError) {
      console.error('❌ Error fetching all fare matrices:', allError);
    } else {
      console.log('📊 ALL ACTIVE FARE MATRIX RECORDS:');
      console.log(`Total records: ${allFareMatrices?.length || 0}`);
      allFareMatrices?.forEach((matrix, index) => {
        console.log(`Record ${index + 1}:`, {
          id: matrix.id,
          booking_type: matrix.booking_type,
          vehicle_type: matrix.vehicle_type,
          base_fare: matrix.base_fare,
          per_km_rate: matrix.per_km_rate,
          platform_fee: matrix.platform_fee,
          is_active: matrix.is_active
        });
      });
    }
    
    // Now try the specific query
    console.log('🔍 Now fetching specific record for regular + hatchback...');
    const { data: fareMatrices, error } = await supabaseAdmin
      .from('fare_matrix')
      .select('*')
      .eq('booking_type', 'regular')
      .eq('vehicle_type', vehicleType)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    console.log('=== SPECIFIC QUERY RESULT ===');
    console.log('Query error:', error);
    console.log('Query result:', fareMatrices);
    console.log('Number of records found:', fareMatrices?.length || 0);

    if (error) {
      console.error('Error fetching fare matrix:', error);
      throw new Error('Fare configuration not found');
    }

    if (!fareMatrices || fareMatrices.length === 0) {
      console.error('❌ No fare matrix found for:', { booking_type: 'regular', vehicle_type: vehicleType });
      throw new Error('Fare configuration not found for this vehicle type');
    }

    const fareMatrix = fareMatrices[0];

    console.log('=== FOUND FARE MATRIX RECORD ===');
    console.log('Raw fareMatrix object:', JSON.stringify(fareMatrix, null, 2));
    
    console.log('✅ Fare matrix loaded:', {
      base_fare: fareMatrix.base_fare,
      per_km_rate: fareMatrix.per_km_rate,
      surge_multiplier: fareMatrix.surge_multiplier,
      platform_fee: fareMatrix.platform_fee
    });

    // CRITICAL DEBUG: Inspect the exact platform_fee value from database
    console.log('=== PLATFORM FEE ROOT CAUSE DEBUG ===');
    console.log('Raw fareMatrix.platform_fee from database:', fareMatrix.platform_fee);
    console.log('Type of fareMatrix.platform_fee:', typeof fareMatrix.platform_fee);
    console.log('String representation:', String(fareMatrix.platform_fee));
    console.log('JSON.stringify representation:', JSON.stringify(fareMatrix.platform_fee));
    console.log('Is null?', fareMatrix.platform_fee === null);
    console.log('Is undefined?', fareMatrix.platform_fee === undefined);
    console.log('Is empty string?', fareMatrix.platform_fee === '');
    console.log('Number() conversion:', Number(fareMatrix.platform_fee));
    console.log('parseFloat() conversion:', parseFloat(fareMatrix.platform_fee));
    console.log('parseInt() conversion:', parseInt(fareMatrix.platform_fee));
    console.log('Is Number() result NaN?', isNaN(Number(fareMatrix.platform_fee)));
    console.log('Is parseFloat() result NaN?', isNaN(parseFloat(fareMatrix.platform_fee)));

    // Add comprehensive debugging for platform fee
    console.log('=== RAW FARE MATRIX OBJECT ===');
    console.log('Raw fareMatrix object:', JSON.stringify(fareMatrix, null, 2));
    console.log('typeof fareMatrix.platform_fee:', typeof fareMatrix.platform_fee);
    console.log('fareMatrix.platform_fee value:', fareMatrix.platform_fee);
    
    // Get platform fee with proper NaN handling
    const rawPlatformFee = fareMatrix.platform_fee;
    console.log('Raw platform fee from database:', rawPlatformFee);
    console.log('Type of raw platform fee:', typeof rawPlatformFee);
    console.log('Is raw platform fee NaN?', isNaN(Number(rawPlatformFee)));
    
    // Try multiple conversion methods to see which one works
    const numberConversion = Number(rawPlatformFee);
    const parseFloatConversion = parseFloat(rawPlatformFee);
    const directAssignment = rawPlatformFee;
    
    console.log('=== CONVERSION ATTEMPTS ===');
    console.log('Number() result:', numberConversion, 'isNaN:', isNaN(numberConversion));
    console.log('parseFloat() result:', parseFloatConversion, 'isNaN:', isNaN(parseFloatConversion));
    console.log('Direct assignment:', directAssignment, 'type:', typeof directAssignment);
    
    // Use the most reliable conversion method
    let platformFee;
    if (!isNaN(parseFloatConversion)) {
      platformFee = parseFloatConversion;
      console.log('✅ Using parseFloat conversion:', platformFee);
    } else if (!isNaN(numberConversion)) {
      platformFee = numberConversion;
      console.log('✅ Using Number conversion:', platformFee);
    } else if (typeof directAssignment === 'number' && !isNaN(directAssignment)) {
      platformFee = directAssignment;
      console.log('✅ Using direct assignment:', platformFee);
    } else {
      platformFee = 10; // Fallback
      console.log('⚠️ Using fallback value:', platformFee);
    }
    
    console.log('Platform fee after NaN check:', platformFee);
    console.log('Type of final platform fee:', typeof platformFee);
    console.log('Is final platform fee NaN?', isNaN(platformFee));

    const baseFare = Number(fareMatrix.base_fare) || 0;
    const baseKmIncluded = 4; // Base fare includes 4km
    const perKmRate = Number(fareMatrix.per_km_rate) || 0;
    const surgeMultiplier = Number(fareMatrix.surge_multiplier) || 1;
    
    console.log('=== FARE COMPONENTS DEBUG ===');
    console.log('baseFare:', baseFare, 'type:', typeof baseFare, 'isNaN:', isNaN(baseFare));
    console.log('perKmRate:', perKmRate, 'type:', typeof perKmRate, 'isNaN:', isNaN(perKmRate));
    console.log('surgeMultiplier:', surgeMultiplier, 'type:', typeof surgeMultiplier, 'isNaN:', isNaN(surgeMultiplier));
    console.log('platformFee:', platformFee, 'type:', typeof platformFee, 'isNaN:', isNaN(platformFee));

    // Calculate distance fare (only for km beyond 4km base inclusion)
    const extraKm = Math.max(0, actualDistanceKm - baseKmIncluded);
    const distanceFare = extraKm * perKmRate;
    
    console.log('📏 Distance calculation:', {
      actualDistanceKm,
      baseKmIncluded,
      extraKm,
      perKmRate,
      distanceFare
    });

    // Calculate deadhead charges using proper zone detection
    console.log('🎯 About to calculate deadhead charges with params:', {
      dropLat,
      dropLng,
      perKmRate,
      zonesCount: zones?.length || 0
    });

    const deadheadResult = this.calculateDeadheadCharges(dropLat, dropLng, perKmRate, zones);
    const deadheadCharges = Number(deadheadResult.deadheadCharges) || 0;

    console.log('🎯 Deadhead charges result:', {
      deadheadCharges,
      rawDeadheadCharges: deadheadResult.deadheadCharges,
      type: typeof deadheadCharges,
      isNaN: isNaN(deadheadCharges),
      zoneDetected: deadheadResult.zoneDetected,
      isInnerZone: deadheadResult.isInnerZone
    });
    
    // Calculate surge charges
    const subtotalBeforeSurge = baseFare + distanceFare + deadheadCharges;
    const surgeCharges = subtotalBeforeSurge * (surgeMultiplier - 1);

    console.log('💰 Surge calculation:', {
      subtotalBeforeSurge,
      type: typeof subtotalBeforeSurge,
      isNaN: isNaN(subtotalBeforeSurge),
      surgeMultiplier,
      surgeCharges,
      surgeChargesType: typeof surgeCharges,
      surgeChargesIsNaN: isNaN(surgeCharges)
    });

    // Ensure all components are valid numbers before further calculations
    const validBaseFare = isNaN(baseFare) ? 0 : baseFare;
    const validDistanceFare = isNaN(distanceFare) ? 0 : distanceFare;
    const validDeadheadCharges = isNaN(deadheadCharges) ? 0 : deadheadCharges;
    const validSurgeCharges = isNaN(surgeCharges) ? 0 : surgeCharges;
    const validPlatformFee = isNaN(platformFee) ? 10 : platformFee;

    console.log('=== VALIDATED COMPONENTS (BEFORE GST) ===');
    console.log('- validBaseFare:', validBaseFare);
    console.log('- validDistanceFare:', validDistanceFare);
    console.log('- validDeadheadCharges:', validDeadheadCharges);
    console.log('- validSurgeCharges:', validSurgeCharges);
    console.log('- validPlatformFee:', validPlatformFee);

    // Calculate GST on charges (excluding platform fee) - 5% GST
    const chargesSubtotal = validBaseFare + validDistanceFare + validDeadheadCharges + validSurgeCharges;
    const gstOnCharges = chargesSubtotal * 0.05; // 5% GST on ride charges

    console.log('💰 GST on charges calculation:', {
      chargesSubtotal,
      gstOnCharges,
      gstRate: '5%'
    });

    // Calculate GST on platform fee - 18% GST
    const gstOnPlatformFee = validPlatformFee * 0.18;
    console.log('GST on platform fee calculation:');
    console.log('- validPlatformFee for GST:', validPlatformFee, 'type:', typeof validPlatformFee, 'isNaN:', isNaN(validPlatformFee));
    console.log('- gstOnPlatformFee result:', gstOnPlatformFee, 'type:', typeof gstOnPlatformFee, 'isNaN:', isNaN(gstOnPlatformFee));

    const validGstOnCharges = isNaN(gstOnCharges) ? 0 : gstOnCharges;
    const validGstOnPlatformFee = isNaN(gstOnPlatformFee) ? 0 : gstOnPlatformFee;

    console.log('=== VALIDATED GST COMPONENTS ===');
    console.log('- validGstOnCharges:', validGstOnCharges);
    console.log('- validGstOnPlatformFee:', validGstOnPlatformFee);

    // Calculate total fare and round to nearest integer
    const totalFareRaw = validBaseFare + validDistanceFare + validDeadheadCharges + validSurgeCharges + validPlatformFee + validGstOnCharges + validGstOnPlatformFee;
    const totalFare = Math.round(totalFareRaw);

    console.log('=== FINAL TOTAL FARE ===');
    console.log('totalFare raw:', totalFareRaw, 'rounded:', totalFare, 'type:', typeof totalFare, 'isNaN:', isNaN(totalFare));
    
    console.log('💰 Regular fare breakdown:', {
      baseFare: validBaseFare,
      distanceFare: validDistanceFare,
      deadheadCharges: validDeadheadCharges,
      surgeCharges: validSurgeCharges,
      platformFee: validPlatformFee,
      gstOnCharges: validGstOnCharges,
      gstOnPlatformFee: validGstOnPlatformFee,
      totalFare,
    });

    return {
      booking_type: 'regular',
      vehicle_type: vehicleType,
      base_fare: validBaseFare,
      distance_fare: validDistanceFare,
      time_fare: 0,
      surge_charges: validSurgeCharges,
      deadhead_charges: validDeadheadCharges,
      platform_fee: validPlatformFee,
      gst_on_charges: validGstOnCharges,
      gst_on_platform_fee: validGstOnPlatformFee,
      extra_km_charges: 0,
      driver_allowance: 0,
      total_fare: totalFare,
      details: {
        actual_distance_km: actualDistanceKm,
        actual_duration_minutes: actualDurationMinutes,
        base_km_included: baseKmIncluded,
        extra_km: extraKm,
        per_km_rate: isNaN(perKmRate) ? 0 : perKmRate,
        surge_multiplier: isNaN(surgeMultiplier) ? 1 : surgeMultiplier,
        platform_fee_flat: validPlatformFee,
        zone_detected: deadheadResult.zoneDetected,
        is_inner_zone: deadheadResult.isInnerZone,
        minimum_fare: isNaN(Number(fareMatrix.minimum_fare)) ? 0 : Number(fareMatrix.minimum_fare)
      }
    };
  }

  /**
   * Rental ride fare calculation - using actual distance and duration
   */
  private static async calculateRentalFare(
    vehicleType: string,
    actualDistanceKm: number,
    actualDurationMinutes: number,
    selectedHours: number
  ): Promise<FareBreakdown> {
    console.log('=== CALCULATING RENTAL FARE (ACTUAL DISTANCE & TIME) ===');
    console.log('Vehicle Type:', vehicleType);
    console.log('Selected Hours:', selectedHours);
    console.log('Actual Distance:', actualDistanceKm, 'km');
    console.log('Actual Duration:', actualDurationMinutes, 'minutes');

    // Get rental fare for the selected package
    const { data: rentalFares, error } = await supabaseAdmin
      .from('rental_fares')
      .select('*')
      .eq('vehicle_type', vehicleType)
      .eq('duration_hours', selectedHours)
      .eq('is_active', true)
      .order('is_popular', { ascending: false })
      .limit(1);

    if (error || !rentalFares || rentalFares.length === 0) {
      console.error('Error fetching rental fare:', error);
      throw new Error('Rental fare configuration not found');
    }

    const rentalFare = rentalFares[0];
    const baseFare = rentalFare.base_fare;
    const kmIncluded = rentalFare.km_included;
    const extraKmRate = rentalFare.extra_km_rate;
    const extraMinuteRate = rentalFare.extra_minute_rate || 0;

    console.log('✅ Rental package details:', {
      package_name: rentalFare.package_name,
      base_fare: baseFare,
      km_included: kmIncluded,
      extra_km_rate: extraKmRate,
      extra_minute_rate: extraMinuteRate
    });

    // Calculate extra KM charges based on ACTUAL distance
    let extraKmCharges = 0;
    let extraKm = 0;
    if (actualDistanceKm > kmIncluded) {
      extraKm = actualDistanceKm - kmIncluded;
      extraKmCharges = extraKm * extraKmRate;
      console.log('⚠️ Extra distance charges:', {
        actual_distance: actualDistanceKm,
        km_included: kmIncluded,
        extra_km: extraKm,
        extra_km_rate: extraKmRate,
        extra_km_charges: extraKmCharges
      });
    } else {
      console.log('✅ Distance within package allowance');
    }

    // Calculate extra time charges based on ACTUAL duration
    let extraTimeCharges = 0;
    let extraMinutes = 0;
    const packageMinutes = selectedHours * 60;
    if (actualDurationMinutes > packageMinutes) {
      extraMinutes = actualDurationMinutes - packageMinutes;
      extraTimeCharges = extraMinutes * extraMinuteRate;
      console.log('⚠️ Extra time charges:', {
        actual_duration_minutes: actualDurationMinutes,
        package_minutes: packageMinutes,
        extra_minutes: extraMinutes,
        extra_minute_rate: extraMinuteRate,
        extra_time_charges: extraTimeCharges
      });
    } else {
      console.log('✅ Duration within package allowance');
    }

    const withinAllowance = extraKmCharges === 0 && extraTimeCharges === 0;
    const totalFareRaw = baseFare + extraKmCharges + extraTimeCharges;
    const totalFare = Math.round(totalFareRaw);

    console.log('💰 Rental fare breakdown (actual usage):', {
      baseFare,
      extraKmCharges,
      extraTimeCharges,
      totalFareRaw,
      totalFare,
      withinAllowance
    });

    return {
      booking_type: 'rental',
      vehicle_type: vehicleType,
      base_fare: baseFare,
      distance_fare: extraKmCharges,
      time_fare: extraTimeCharges,
      surge_charges: 0,
      deadhead_charges: 0,
      platform_fee: 0,
      gst_on_charges: 0,
      gst_on_platform_fee: 0,
      extra_km_charges: extraKmCharges,
      driver_allowance: 0,
      total_fare: totalFare,
      details: {
        actual_distance_km: actualDistanceKm,
        actual_duration_minutes: actualDurationMinutes,
        base_km_included: kmIncluded,
        extra_km: extraKm,
        per_km_rate: extraKmRate,
        per_minute_rate: extraMinuteRate,
        within_allowance: withinAllowance,
        package_name: rentalFare.package_name
      }
    };
  }

  /**
   * Outstation ride fare calculation
   */
  private static async calculateOutstationFare(
    vehicleType: string,
    actualDistanceKm: number,
    actualDurationMinutes: number,
    scheduledTime: string | null,
    tripType: 'one_way' | 'round_trip'
  ): Promise<FareBreakdown> {
    console.log('=== CALCULATING OUTSTATION FARE ===');
    console.log('Vehicle Type:', vehicleType);
    console.log('Trip Type:', tripType);
    console.log('Actual GPS-tracked Distance:', actualDistanceKm, 'km');

    const startTime = scheduledTime ? new Date(scheduledTime) : new Date();
    const endTime = new Date();
    const durationHours = Math.abs(endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    const numberOfDays = Math.max(1, Math.ceil(durationHours / 24));

    console.log('📅 Trip duration calculation:', {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationHours,
      numberOfDays,
      tripType
    });

    // ONE-WAY TRIP LOGIC
    if (tripType === 'one_way') {
      console.log('🛣️ ONE-WAY TRIP CALCULATION');

      const { data: outstationFares, error } = await supabaseAdmin
        .from('outstation_fares')
        .select('*')
        .eq('vehicle_type', vehicleType)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !outstationFares || outstationFares.length === 0) {
        console.error('Error fetching outstation fare:', error);
        throw new Error('Outstation fare configuration not found');
      }

      const outstationConfig = outstationFares[0];
      const baseFare = outstationConfig.base_fare;
      const perKmRate = outstationConfig.per_km_rate;

      console.log('✅ Outstation config loaded:', {
        base_fare: baseFare,
        per_km_rate: perKmRate
      });

      // ONE WAY: base_fare + (km_travelled × price_per_km × 2)
      const kmFare = actualDistanceKm * perKmRate * 2;

      // Get platform fee from fare matrix
      const { data: fareMatrix } = await supabaseAdmin
        .from('fare_matrix')
        .select('platform_fee')
        .eq('booking_type', 'outstation')
        .eq('vehicle_type', vehicleType)
        .eq('is_active', true)
        .single();

      const platformFee = parseFloat(fareMatrix?.platform_fee?.toString() || '10');

      // Calculate GST
      const chargesSubtotal = baseFare + kmFare;
      const gstOnCharges = chargesSubtotal * 0.05; // 5% GST
      const gstOnPlatformFee = platformFee * 0.18; // 18% GST

      const totalFareRaw = baseFare + kmFare + platformFee + gstOnCharges + gstOnPlatformFee;
      const totalFare = Math.round(totalFareRaw);

      console.log('💰 ONE-WAY CALCULATION:', {
        baseFare,
        actualDistanceKm,
        perKmRate,
        kmFare,
        calculation: `${baseFare} + (${actualDistanceKm} × ${perKmRate} × 2) = ${baseFare} + ${kmFare}`,
        platformFee,
        gstOnCharges,
        gstOnPlatformFee,
        totalFareRaw,
        totalFare
      });

      return {
        booking_type: 'outstation',
        vehicle_type: vehicleType,
        base_fare: baseFare,
        distance_fare: kmFare,
        time_fare: 0,
        surge_charges: 0,
        deadhead_charges: 0,
        platform_fee: platformFee,
        gst_on_charges: gstOnCharges,
        gst_on_platform_fee: gstOnPlatformFee,
        extra_km_charges: 0,
        driver_allowance: 0,
        total_fare: totalFare,
        details: {
          actual_distance_km: actualDistanceKm,
          actual_duration_minutes: actualDurationMinutes,
          per_km_rate: perKmRate,
          days_calculated: numberOfDays,
          within_allowance: true,
          total_km_travelled: actualDistanceKm,
          direction: 'one_way'
        }
      };
    }

    // ROUND TRIP LOGIC
    console.log('🔄 ROUND TRIP CALCULATION');
    const isSameDayTrip = numberOfDays === 1;
    const useSlab = isSameDayTrip && actualDistanceKm <= 150;

    console.log('🔍 Fare calculation method decision:', {
      isSameDayTrip,
      actualDistanceKm,
      useSlab,
      method: useSlab ? 'SLAB SYSTEM' : 'PER-KM SYSTEM'
    });

    if (useSlab) {
      const { data: slabPackages, error: slabError } = await supabaseAdmin
        .from('outstation_packages')
        .select('*')
        .eq('vehicle_type', vehicleType)
        .eq('is_active', true)
        .eq('use_slab_system', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (slabError || !slabPackages || slabPackages.length === 0) {
        console.error('⚠️ Slab package not found, falling back to per-km');
      } else {
        const slabPackage = slabPackages[0];

        const slabs = [
          { limit: 10, fare: slabPackage.slab_10km },
          { limit: 20, fare: slabPackage.slab_20km },
          { limit: 30, fare: slabPackage.slab_30km },
          { limit: 40, fare: slabPackage.slab_40km },
          { limit: 50, fare: slabPackage.slab_50km },
          { limit: 60, fare: slabPackage.slab_60km },
          { limit: 70, fare: slabPackage.slab_70km },
          { limit: 80, fare: slabPackage.slab_80km },
          { limit: 90, fare: slabPackage.slab_90km },
          { limit: 100, fare: slabPackage.slab_100km },
          { limit: 110, fare: slabPackage.slab_110km },
          { limit: 120, fare: slabPackage.slab_120km },
          { limit: 130, fare: slabPackage.slab_130km },
          { limit: 140, fare: slabPackage.slab_140km },
          { limit: 150, fare: slabPackage.slab_150km }
        ];

        let selectedSlab = slabs[slabs.length - 1];
        for (const slab of slabs) {
          if (actualDistanceKm <= slab.limit) {
            selectedSlab = slab;
            break;
          }
        }

        const slabFare = parseFloat(selectedSlab.fare?.toString() || '0');
        const extraKm = Math.max(0, actualDistanceKm - selectedSlab.limit);
        const extraKmCharges = extraKm > 0 ? extraKm * parseFloat(slabPackage.extra_km_rate?.toString() || '0') : 0;

        // Get platform fee from fare matrix
        const { data: fareMatrix } = await supabaseAdmin
          .from('fare_matrix')
          .select('platform_fee')
          .eq('booking_type', 'outstation')
          .eq('vehicle_type', vehicleType)
          .eq('is_active', true)
          .single();

        const platformFee = parseFloat(fareMatrix?.platform_fee?.toString() || '10');

        // Calculate GST
        const chargesSubtotal = slabFare + extraKmCharges;
        const gstOnCharges = chargesSubtotal * 0.05; // 5% GST
        const gstOnPlatformFee = platformFee * 0.18; // 18% GST

        const totalFareRaw = slabFare + extraKmCharges + platformFee + gstOnCharges + gstOnPlatformFee;
        const totalFare = Math.round(totalFareRaw);

        console.log('💰 SLAB CALCULATION:', {
          selectedSlab: `${selectedSlab.limit}km`,
          slabFare,
          extraKm,
          extraKmRate: slabPackage.extra_km_rate,
          extraKmCharges,
          platformFee,
          gstOnCharges,
          gstOnPlatformFee,
          totalFareRaw,
          totalFare,
          note: 'No driver allowance for same-day trips ≤150km'
        });

        return {
          booking_type: 'outstation',
          vehicle_type: vehicleType,
          base_fare: slabFare,
          distance_fare: 0,
          time_fare: 0,
          surge_charges: 0,
          deadhead_charges: 0,
          platform_fee: platformFee,
          gst_on_charges: gstOnCharges,
          gst_on_platform_fee: gstOnPlatformFee,
          extra_km_charges: extraKmCharges,
          driver_allowance: 0,
          total_fare: totalFare,
          details: {
            actual_distance_km: actualDistanceKm,
            actual_duration_minutes: actualDurationMinutes,
            per_km_rate: parseFloat(slabPackage.extra_km_rate?.toString() || '0'),
            days_calculated: 1,
            within_allowance: extraKm === 0,
            package_name: `${selectedSlab.limit}km Slab`,
            extra_km: extraKm,
            base_km_included: selectedSlab.limit,
            total_km_travelled: actualDistanceKm
          }
        };
      }
    }

    const { data: outstationFares, error } = await supabaseAdmin
      .from('outstation_fares')
      .select('*')
      .eq('vehicle_type', vehicleType)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !outstationFares || outstationFares.length === 0) {
      console.error('Error fetching outstation fare:', error);
      throw new Error('Outstation fare configuration not found');
    }

    const outstationConfig = outstationFares[0];
    const baseFare = outstationConfig.base_fare;
    const perKmRate = outstationConfig.per_km_rate;
    const driverAllowancePerDay = outstationConfig.driver_allowance_per_day;
    const dailyKmLimit = outstationConfig.daily_km_limit;

    console.log('✅ Per-KM config loaded:', {
      base_fare: baseFare,
      per_km_rate: perKmRate,
      driver_allowance_per_day: driverAllowancePerDay,
      daily_km_limit: dailyKmLimit
    });

    // ROUND TRIP: Total KM travelled is the actual distance
    const totalKmTravelled = actualDistanceKm;
    const totalKmAllowance = dailyKmLimit * numberOfDays;
    const driverAllowance = numberOfDays * driverAllowancePerDay;

    console.log('🚗 Round Trip distance calculation:', {
      actualGPSDistance: actualDistanceKm,
      totalKmTravelled,
      dailyKmLimit,
      numberOfDays,
      totalKmAllowance,
      driverAllowance
    });

    let kmFare = 0;
    let withinAllowance = true;

    if (totalKmTravelled <= totalKmAllowance) {
      // Within allowance: dailyKmLimit × numberOfDays × perKmRate + driverAllowance × numberOfDays
      kmFare = dailyKmLimit * numberOfDays * perKmRate;
      withinAllowance = true;
      console.log('✅ Within daily allowance:', {
        kmFare,
        calculation: `${dailyKmLimit} × ${numberOfDays} × ${perKmRate} = ${kmFare}`,
        driverAllowance,
        allowanceCalculation: `${driverAllowancePerDay} × ${numberOfDays} = ${driverAllowance}`
      });
    } else {
      // Exceeds allowance: totalKmTravelled × perKmRate + driverAllowance × numberOfDays
      kmFare = totalKmTravelled * perKmRate;
      withinAllowance = false;
      console.log('⚠️ Exceeds daily allowance:', {
        kmFare,
        calculation: `${totalKmTravelled} × ${perKmRate} = ${kmFare}`,
        driverAllowance,
        allowanceCalculation: `${driverAllowancePerDay} × ${numberOfDays} = ${driverAllowance}`,
        extraKm: totalKmTravelled - totalKmAllowance
      });
    }

    // Get platform fee from fare matrix
    const { data: fareMatrix } = await supabaseAdmin
      .from('fare_matrix')
      .select('platform_fee')
      .eq('booking_type', 'outstation')
      .eq('vehicle_type', vehicleType)
      .eq('is_active', true)
      .single();

    const platformFee = parseFloat(fareMatrix?.platform_fee?.toString() || '10');

    // Calculate GST
    const chargesSubtotal = baseFare + kmFare + driverAllowance;
    const gstOnCharges = chargesSubtotal * 0.05; // 5% GST
    const gstOnPlatformFee = platformFee * 0.18; // 18% GST

    const totalFareRaw = baseFare + kmFare + driverAllowance + platformFee + gstOnCharges + gstOnPlatformFee;
    const totalFare = Math.round(totalFareRaw);

    console.log('💰 ROUND TRIP fare breakdown:', {
      baseFare,
      kmFare,
      driverAllowance,
      platformFee,
      gstOnCharges,
      gstOnPlatformFee,
      totalFareRaw,
      totalFare,
      withinAllowance,
      calculation: `${baseFare} + ${kmFare} + ${driverAllowance} + ${platformFee} + ${gstOnCharges} + ${gstOnPlatformFee} = ${totalFare}`
    });

    return {
      booking_type: 'outstation',
      vehicle_type: vehicleType,
      base_fare: baseFare,
      distance_fare: kmFare,
      time_fare: 0,
      surge_charges: 0,
      deadhead_charges: 0,
      platform_fee: platformFee,
      gst_on_charges: gstOnCharges,
      gst_on_platform_fee: gstOnPlatformFee,
      extra_km_charges: 0,
      driver_allowance: driverAllowance,
      total_fare: totalFare,
      details: {
        actual_distance_km: actualDistanceKm,
        actual_duration_minutes: actualDurationMinutes,
        per_km_rate: perKmRate,
        days_calculated: numberOfDays,
        daily_km_limit: dailyKmLimit,
        within_allowance: withinAllowance,
        total_km_travelled: totalKmTravelled,
        km_allowance: totalKmAllowance
      }
    };
  }

  /**
   * Airport ride fare calculation
   */
  private static async calculateAirportFare(
    vehicleType: string,
    pickupLat: number,
    pickupLng: number,
    dropLat: number,
    dropLng: number
  ): Promise<FareBreakdown> {
    console.log('=== CALCULATING AIRPORT FARE ===');
    console.log('Vehicle Type:', vehicleType);
    console.log('Pickup coordinates:', pickupLat, pickupLng);
    console.log('Drop coordinates:', dropLat, dropLng);

    // Get airport fare configuration
    const { data: airportFares, error } = await supabaseAdmin
      .from('airport_fares')
      .select('*')
      .eq('vehicle_type', vehicleType)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching airport fare:', error);
      throw new Error('Airport fare configuration not found');
    }

    if (!airportFares || airportFares.length === 0) {
      console.error('No airport fare found for:', { vehicle_type: vehicleType });
      throw new Error('Airport fare configuration not found');
    }

    const airportConfig = airportFares[0];
    console.log('✅ Airport config loaded:', {
      hosur_to_airport_fare: airportConfig.hosur_to_airport_fare,
      airport_to_hosur_fare: airportConfig.airport_to_hosur_fare
    });
    
    // Determine direction based on coordinates
    // Define Hosur city center coordinates
    const cityCenter = { lat: 12.7401984, lng: 77.824 }; // Hosur center
    
    const pickupToCenter = calculateDistance(
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: cityCenter.lat, longitude: cityCenter.lng }
    );
    const dropToCenter = calculateDistance(
      { latitude: dropLat, longitude: dropLng },
      { latitude: cityCenter.lat, longitude: cityCenter.lng }
    );
    
    const isHosurToAirport = pickupToCenter < dropToCenter;
    const fare = isHosurToAirport ? airportConfig.hosur_to_airport_fare : airportConfig.airport_to_hosur_fare;
    const direction = isHosurToAirport ? 'Hosur to Airport' : 'Airport to Hosur';
    
    console.log('🛫 Direction determination:', {
      pickupToCenter: pickupToCenter.toFixed(1) + 'km',
      dropToCenter: dropToCenter.toFixed(1) + 'km',
      direction,
      fare
    });

    return {
      booking_type: 'airport',
      vehicle_type: vehicleType,
      base_fare: fare,
      distance_fare: 0,
      time_fare: 0,
      surge_charges: 0,
      deadhead_charges: 0,
      platform_fee: 0,
      gst_on_charges: 0,
      gst_on_platform_fee: 0,
      extra_km_charges: 0,
      driver_allowance: 0,
      total_fare: Math.round(fare),
      details: {
        actual_distance_km: calculateDistance(
          { latitude: pickupLat, longitude: pickupLng },
          { latitude: dropLat, longitude: dropLng }
        ),
        actual_duration_minutes: 0,
        per_km_rate: 0,
        direction: direction
      }
    };
  }

  /**
   * Calculate deadhead charges based on zone detection
   * Applies only for regular rides when drop-off is between inner and outer ring zones
   */
  private static calculateDeadheadCharges(
    dropLat: number,
    dropLng: number,
    perKmRate: number,
    zones: any[]
  ): { deadheadCharges: number; zoneDetected: string; isInnerZone: boolean } {
    console.log('=== CALCULATING DEADHEAD CHARGES ===');
    console.log('Drop-off coordinates:', dropLat, dropLng);
    console.log('Per km rate:', perKmRate);
    console.log('Zones received:', zones?.length || 0);

    if (zones && zones.length > 0) {
      console.log('Zone data received:');
      zones.forEach((zone, i) => {
        console.log(`  Zone ${i + 1}:`, {
          name: zone.name,
          center_latitude: zone.center_latitude,
          center_longitude: zone.center_longitude,
          radius_km: zone.radius_km,
          types: {
            center_lat_type: typeof zone.center_latitude,
            center_lng_type: typeof zone.center_longitude,
            radius_type: typeof zone.radius_km
          }
        });
      });
    } else {
      console.log('⚠️ NO ZONES DATA RECEIVED!');
    }

    // Hosur Bus Stand coordinates (hardcoded)
    const HOSUR_BUS_STAND = {
      lat: 12.7401984,
      lng: 77.824
    };

    // Find inner and outer zones
    const innerZone = zones?.find(zone =>
      zone.name.toLowerCase().includes('inner ring')
    );

    const outerZone = zones?.find(zone =>
      zone.name.toLowerCase().includes('outer ring')
    );

    console.log('Zone search results:', {
      innerZone: innerZone ? `Found: ${innerZone.name}` : 'NOT FOUND',
      outerZone: outerZone ? `Found: ${outerZone.name}` : 'NOT FOUND'
    });

    if (!innerZone || !outerZone) {
      console.log('⚠️ Inner or Outer ring zone not found in database, no deadhead charges applied');
      return { deadheadCharges: 0, zoneDetected: 'Unknown', isInnerZone: false };
    }

    // Parse zone data to ensure numeric values
    const innerRadiusKm = parseFloat(innerZone.radius_km?.toString() || '0');
    const outerRadiusKm = parseFloat(outerZone.radius_km?.toString() || '0');
    const innerCenterLat = parseFloat(innerZone.center_latitude?.toString() || '0');
    const innerCenterLng = parseFloat(innerZone.center_longitude?.toString() || '0');
    const outerCenterLat = parseFloat(outerZone.center_latitude?.toString() || '0');
    const outerCenterLng = parseFloat(outerZone.center_longitude?.toString() || '0');

    console.log('✅ Zones found:', {
      innerZone: {
        name: innerZone.name,
        center: [innerCenterLat, innerCenterLng],
        radius: innerRadiusKm + 'km'
      },
      outerZone: {
        name: outerZone.name,
        center: [outerCenterLat, outerCenterLng],
        radius: outerRadiusKm + 'km'
      }
    });

    // Calculate distance from drop-off to inner zone center
    const distanceToInnerCenter = calculateDistance(
      { latitude: dropLat, longitude: dropLng },
      { latitude: innerCenterLat, longitude: innerCenterLng }
    );

    // Calculate distance from drop-off to outer zone center (same center as inner)
    const distanceToOuterCenter = calculateDistance(
      { latitude: dropLat, longitude: dropLng },
      { latitude: outerCenterLat, longitude: outerCenterLng }
    );

    console.log('📏 Distance calculations:', {
      distanceToInnerCenter: distanceToInnerCenter.toFixed(2) + 'km',
      innerRadiusKm: innerRadiusKm + 'km',
      withinInner: distanceToInnerCenter <= innerRadiusKm,
      distanceToOuterCenter: distanceToOuterCenter.toFixed(2) + 'km',
      outerRadiusKm: outerRadiusKm + 'km',
      beyondOuter: distanceToOuterCenter > outerRadiusKm,
      inDeadheadZone: (distanceToInnerCenter > innerRadiusKm && distanceToOuterCenter <= outerRadiusKm)
    });

    // Check if drop-off is within inner zone (no deadhead charges)
    if (distanceToInnerCenter <= innerRadiusKm) {
      console.log('✅ Drop-off is WITHIN inner ring zone - NO deadhead charges');
      return {
        deadheadCharges: 0,
        zoneDetected: innerZone.name,
        isInnerZone: true
      };
    }

    // Check if drop-off is beyond outer zone (no deadhead charges)
    if (distanceToOuterCenter > outerRadiusKm) {
      console.log('✅ Drop-off is BEYOND outer ring zone - NO deadhead charges');
      return {
        deadheadCharges: 0,
        zoneDetected: 'Beyond Outer Zone',
        isInnerZone: false
      };
    }

    // Drop-off is BETWEEN inner and outer zones - apply deadhead charges
    // Calculate distance from drop-off to Hosur Bus Stand
    console.log('🎯 DEADHEAD ZONE DETECTED - Calculating charges...');
    console.log('Input parameters:', {
      dropLat,
      dropLng,
      hosurLat: HOSUR_BUS_STAND.lat,
      hosurLng: HOSUR_BUS_STAND.lng,
      perKmRate,
      perKmRateType: typeof perKmRate,
      perKmRateIsNaN: isNaN(perKmRate)
    });

    const distanceToHosurBusStand = calculateDistance(
      { latitude: dropLat, longitude: dropLng },
      { latitude: HOSUR_BUS_STAND.lat, longitude: HOSUR_BUS_STAND.lng }
    );

    console.log('Distance to Hosur Bus Stand calculated:', {
      distance: distanceToHosurBusStand,
      distanceType: typeof distanceToHosurBusStand,
      distanceIsNaN: isNaN(distanceToHosurBusStand)
    });

    // Deadhead charges = (distance from drop-off to Hosur Bus Stand / 2) * per km rate
    const halfDistance = distanceToHosurBusStand / 2;
    const deadheadCharges = halfDistance * perKmRate;

    console.log('📍 Drop-off is BETWEEN inner and outer ring zones - applying deadhead charges:', {
      distanceToInnerCenter: distanceToInnerCenter.toFixed(2) + 'km',
      innerRadius: innerRadiusKm + 'km',
      distanceToOuterCenter: distanceToOuterCenter.toFixed(2) + 'km',
      outerRadius: outerRadiusKm + 'km',
      distanceToHosurBusStand: distanceToHosurBusStand.toFixed(2) + 'km',
      halfDistance: halfDistance.toFixed(2) + 'km',
      perKmRate: perKmRate,
      deadheadCharges: deadheadCharges,
      deadheadChargesType: typeof deadheadCharges,
      deadheadChargesIsNaN: isNaN(deadheadCharges),
      deadheadChargesFixed: deadheadCharges.toFixed(2),
      calculation: `(${distanceToHosurBusStand.toFixed(2)} / 2) × ${perKmRate} = ${deadheadCharges.toFixed(2)}`
    });

    return {
      deadheadCharges,
      zoneDetected: 'Between Inner and Outer Ring',
      isInnerZone: false
    };
  }

  /**
   * Get trip completion details by ride ID
   */
  static async getTripCompletion(rideId: string) {
    try {
      const { data, error } = await supabaseAdmin
        .from('trip_completions')
        .select('*')
        .eq('ride_id', rideId)
        .single();

      if (error) {
        console.error('Error fetching trip completion:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Exception fetching trip completion:', error);
      return null;
    }
  }
}