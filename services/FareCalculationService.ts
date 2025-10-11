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
        scheduled_time: ride.scheduled_time
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
            ride.scheduled_time
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
    const deadheadResult = this.calculateDeadheadCharges(dropLat, dropLng, perKmRate, zones);
    const deadheadCharges = Number(deadheadResult.deadheadCharges) || 0;
    
    console.log('🎯 Deadhead charges:', {
      deadheadCharges,
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

    // Calculate total fare
    const totalFare = validBaseFare + validDistanceFare + validDeadheadCharges + validSurgeCharges + validPlatformFee + validGstOnCharges + validGstOnPlatformFee;

    console.log('=== FINAL TOTAL FARE ===');
    console.log('totalFare result:', totalFare, 'type:', typeof totalFare, 'isNaN:', isNaN(totalFare));
    
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
   * Rental ride fare calculation
   */
  private static async calculateRentalFare(
    vehicleType: string,
    actualDistanceKm: number,
    actualDurationMinutes: number,
    selectedHours: number
  ): Promise<FareBreakdown> {
    console.log('=== CALCULATING RENTAL FARE ===');
    console.log('Vehicle Type:', vehicleType);
    console.log('Selected Hours:', selectedHours);
    console.log('Actual Distance:', actualDistanceKm, 'km');

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

    console.log('✅ Rental package details:', {
      package_name: rentalFare.package_name,
      base_fare: baseFare,
      km_included: kmIncluded,
      extra_km_rate: extraKmRate
    });
    let extraKmCharges = 0;
    let withinAllowance = true;

    // Check if actual distance exceeds package allowance
    if (actualDistanceKm > kmIncluded) {
      const extraKm = actualDistanceKm - kmIncluded;
      extraKmCharges = extraKm * extraKmRate;
      withinAllowance = false;
      console.log('⚠️ Distance exceeds package allowance:', {
        extraKm,
        extraKmRate,
        extraKmCharges
      });
    } else {
      console.log('✅ Distance within package allowance');
    }

    const totalFare = baseFare + extraKmCharges;
    
    console.log('💰 Rental fare breakdown:', {
      baseFare,
      extraKmCharges,
      totalFare,
      withinAllowance
    });

    return {
      booking_type: 'rental',
      vehicle_type: vehicleType,
      base_fare: baseFare,
      distance_fare: 0,
      time_fare: 0,
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
        extra_km: Math.max(0, actualDistanceKm - kmIncluded),
        per_km_rate: extraKmRate,
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
    scheduledTime: string | null
  ): Promise<FareBreakdown> {
    console.log('=== CALCULATING OUTSTATION FARE ===');
    console.log('Vehicle Type:', vehicleType);
    console.log('Actual Distance (one-way):', actualDistanceKm, 'km');

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

    console.log('✅ Outstation config loaded:', {
      base_fare: baseFare,
      per_km_rate: perKmRate,
      driver_allowance_per_day: driverAllowancePerDay,
      daily_km_limit: dailyKmLimit
    });
    // Calculate number of days (24-hour periods from start time)
    const startTime = scheduledTime ? new Date(scheduledTime) : new Date();
    const endTime = new Date();
    const durationHours = Math.abs(endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    const numberOfDays = Math.max(1, Math.ceil(durationHours / 24));

    console.log('📅 Trip duration calculation:', {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationHours,
      numberOfDays,
    });

    // Calculate round trip distance (actualDistanceKm is one-way)
    const totalKmTravelled = actualDistanceKm * 2;
    const totalKmAllowance = dailyKmLimit * numberOfDays;
    const driverAllowance = numberOfDays * driverAllowancePerDay;

    console.log('🚗 Outstation distance calculation:', {
      oneWayDistance: actualDistanceKm,
      totalKmTravelled,
      dailyKmLimit,
      numberOfDays,
      totalKmAllowance,
      driverAllowance
    });

    let kmFare = 0;
    let withinAllowance = true;

    if (totalKmTravelled <= totalKmAllowance) {
      // Within allowance: base_fare + dailyKmLimit * numberOfDays * perKmRate + driverAllowancePerDay * numberOfDays
      kmFare = dailyKmLimit * numberOfDays * perKmRate;
      withinAllowance = true;
      console.log('✅ Within daily allowance calculation:', {
        kmFare,
        calculation: `${dailyKmLimit} × ${numberOfDays} × ${perKmRate} = ${kmFare}`
      });
    } else {
      // Exceeds allowance: total km * price per km + driver allowance + base fare
      kmFare = totalKmTravelled * perKmRate;
      withinAllowance = false;
      console.log('⚠️ Exceeds daily allowance calculation:', {
        kmFare,
        calculation: `${totalKmTravelled} × ${perKmRate} = ${kmFare}`
      });
    }

    const totalFare = baseFare + kmFare + driverAllowance;
    
    console.log('💰 Outstation fare breakdown:', {
      baseFare,
      kmFare,
      driverAllowance,
      totalFare,
      withinAllowance
    });

    return {
      booking_type: 'outstation',
      vehicle_type: vehicleType,
      base_fare: baseFare,
      distance_fare: kmFare,
      time_fare: 0,
      surge_charges: 0,
      deadhead_charges: 0,
      platform_fee: 0,
      gst_on_charges: 0,
      gst_on_platform_fee: 0,
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
    
    const pickupToCenter = calculateDistance(pickupLat, pickupLng, cityCenter.lat, cityCenter.lng);
    const dropToCenter = calculateDistance(dropLat, dropLng, cityCenter.lat, cityCenter.lng);
    
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
      total_fare: fare,
      details: {
        actual_distance_km: calculateDistance(pickupLat, pickupLng, dropLat, dropLng),
        actual_duration_minutes: 0,
        per_km_rate: 0,
        direction: direction
      }
    };
  }

  /**
   * Calculate deadhead charges based on zone detection
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
    
    // Find inner and outer zones by exact name matching
    const innerZone = zones?.find(zone => 
      zone.name.toLowerCase().includes('inner') || 
      zone.name.toLowerCase().includes('ring')
    );
    

    if (!innerZone) {
      console.log('⚠️ Inner zone not found in database, defaulting to no deadhead charges');
      return { deadheadCharges: 0, zoneDetected: 'Unknown', isInnerZone: false };
    }

    console.log('✅ Inner zone found:', {
      name: innerZone.name,
      center: [innerZone.center_latitude, innerZone.center_longitude],
      radius: innerZone.radius_km + 'km'
    });
    // Check if drop-off is within inner zone
    const distanceToInnerCenter = calculateDistance(
      dropLat,
      dropLng,
      innerZone.center_latitude,
      innerZone.center_longitude
    );
    
    if (distanceToInnerCenter <= innerZone.radius_km) {
      console.log('✅ Drop-off is WITHIN inner zone - no deadhead charges');
      return { 
        deadheadCharges: 0, 
        zoneDetected: innerZone.name, 
        isInnerZone: true 
      };
    } else {
      // Calculate distance from drop-off to inner zone boundary
      const distanceToInnerBoundary = distanceToInnerCenter - innerZone.radius_km;
      
      // Deadhead charges = (distance from drop-off to inner ring boundary / 2) * per km rate
      const deadheadCharges = (distanceToInnerBoundary / 2) * perKmRate;
      
      console.log('📍 Drop-off is OUTSIDE inner zone - applying deadhead charges:', {
        distanceToCenter: distanceToInnerCenter.toFixed(2) + 'km',
        zoneRadius: innerZone.radius_km + 'km',
        distanceToBoundary: distanceToInnerBoundary.toFixed(2) + 'km',
        deadheadCharges: deadheadCharges.toFixed(2),
        calculation: `(${distanceToInnerBoundary.toFixed(2)} / 2) × ${perKmRate} = ${deadheadCharges.toFixed(2)}`
      });
      
      return { 
        deadheadCharges, 
        zoneDetected: 'Outside Inner Zone', 
        isInnerZone: false 
      };
    }
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