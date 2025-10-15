import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { supabase } from '../utils/supabase';

interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  recorded_at: string;
}

class TripLocationTrackerService {
  private trackingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private locationPoints: Map<string, LocationPoint[]> = new Map();
  private isTracking: Map<string, boolean> = new Map();

  /**
   * Start tracking GPS locations for an active trip
   */
  async startTripTracking(
    tripId: string,
    tripType: 'regular' | 'scheduled',
    driverId: string
  ): Promise<boolean> {
    try {
      console.log('=== STARTING TRIP GPS TRACKING ===');
      console.log('Trip ID:', tripId);
      console.log('Trip Type:', tripType);
      console.log('Driver ID:', driverId);

      // Check if already tracking this trip
      if (this.isTracking.get(tripId)) {
        console.log('⚠️ Already tracking this trip');
        return true;
      }

      // Request location permissions
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.error('❌ Location permission not granted');
        return false;
      }

      // Initialize location points array for this trip
      this.locationPoints.set(tripId, []);
      this.isTracking.set(tripId, true);

      // Record initial location
      await this.recordLocationPoint(tripId, tripType, driverId);

      // Start interval to record location every 5 seconds
      const interval = setInterval(async () => {
        if (!this.isTracking.get(tripId)) {
          clearInterval(interval);
          this.trackingIntervals.delete(tripId);
          return;
        }
        await this.recordLocationPoint(tripId, tripType, driverId);
      }, 5000); // Every 5 seconds

      this.trackingIntervals.set(tripId, interval);

      console.log('✅ Trip GPS tracking started (5-second intervals)');
      return true;
    } catch (error) {
      console.error('❌ Error starting trip tracking:', error);
      return false;
    }
  }

  /**
   * Record a single GPS location point
   */
  private async recordLocationPoint(
    tripId: string,
    tripType: 'regular' | 'scheduled',
    driverId: string
  ): Promise<void> {
    try {
      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        timeout: 10000,
      });

      const locationPoint: LocationPoint = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        speed: location.coords.speed || undefined,
        heading: location.coords.heading || undefined,
        altitude: location.coords.altitude || undefined,
        recorded_at: new Date().toISOString(),
      };

      // Store in memory
      const points = this.locationPoints.get(tripId) || [];
      points.push(locationPoint);
      this.locationPoints.set(tripId, points);

      // Store in database
      const { error } = await supabase
        .from('trip_location_history')
        .insert({
          [tripType === 'regular' ? 'ride_id' : 'scheduled_booking_id']: tripId,
          driver_id: driverId,
          latitude: locationPoint.latitude,
          longitude: locationPoint.longitude,
          accuracy: locationPoint.accuracy,
          speed: locationPoint.speed,
          heading: locationPoint.heading,
          altitude: locationPoint.altitude,
          recorded_at: locationPoint.recorded_at,
        });

      if (error) {
        console.error('❌ Error storing location point:', error);
      } else {
        console.log('📍 Location recorded:', {
          lat: locationPoint.latitude.toFixed(6),
          lng: locationPoint.longitude.toFixed(6),
          totalPoints: points.length,
        });
      }
    } catch (error) {
      console.error('❌ Error recording location point:', error);
    }
  }

  /**
   * Stop tracking GPS locations for a trip
   */
  async stopTripTracking(tripId: string): Promise<void> {
    try {
      console.log('=== STOPPING TRIP GPS TRACKING ===');
      console.log('Trip ID:', tripId);

      // Stop the interval
      const interval = this.trackingIntervals.get(tripId);
      if (interval) {
        clearInterval(interval);
        this.trackingIntervals.delete(tripId);
      }

      // Mark as not tracking
      this.isTracking.set(tripId, false);

      const pointsCount = this.locationPoints.get(tripId)?.length || 0;
      console.log(`✅ Trip GPS tracking stopped. Total points recorded: ${pointsCount}`);
    } catch (error) {
      console.error('❌ Error stopping trip tracking:', error);
    }
  }

  /**
   * Calculate total distance traveled from GPS breadcrumbs
   */
  async calculateTripDistance(
    tripId: string,
    tripType: 'regular' | 'scheduled'
  ): Promise<{ distanceKm: number; pointsUsed: number }> {
    try {
      console.log('=== CALCULATING TRIP DISTANCE FROM GPS ===');
      console.log('Trip ID:', tripId);

      // Fetch all location points from database
      const { data: locationHistory, error } = await supabase
        .from('trip_location_history')
        .select('*')
        .eq(tripType === 'regular' ? 'ride_id' : 'scheduled_booking_id', tripId)
        .order('recorded_at', { ascending: true });

      if (error) {
        console.error('❌ Error fetching location history:', error);
        throw new Error('Failed to fetch location history');
      }

      if (!locationHistory || locationHistory.length < 2) {
        console.warn('⚠️ Not enough GPS points for distance calculation');
        return { distanceKm: 0, pointsUsed: 0 };
      }

      console.log(`📊 Calculating distance from ${locationHistory.length} GPS points`);

      // Calculate cumulative distance using Haversine formula
      let totalDistanceKm = 0;

      for (let i = 1; i < locationHistory.length; i++) {
        const point1 = locationHistory[i - 1];
        const point2 = locationHistory[i];

        const distance = this.calculateHaversineDistance(
          parseFloat(point1.latitude.toString()),
          parseFloat(point1.longitude.toString()),
          parseFloat(point2.latitude.toString()),
          parseFloat(point2.longitude.toString())
        );

        // Filter out unrealistic jumps (e.g., > 500m in 5 seconds = 360 km/h)
        if (distance < 0.5) {
          totalDistanceKm += distance;
        } else {
          console.warn(`⚠️ Skipping unrealistic distance jump: ${distance.toFixed(3)}km`);
        }
      }

      console.log('✅ GPS Distance Calculation:', {
        totalDistanceKm: totalDistanceKm.toFixed(2),
        pointsUsed: locationHistory.length,
        avgDistancePerSegment: (totalDistanceKm / (locationHistory.length - 1)).toFixed(3),
      });

      // Clean up memory
      this.locationPoints.delete(tripId);

      return {
        distanceKm: totalDistanceKm,
        pointsUsed: locationHistory.length,
      };
    } catch (error) {
      console.error('❌ Error calculating trip distance:', error);
      throw error;
    }
  }

  /**
   * Calculate distance between two GPS points using Haversine formula
   */
  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get current tracking status
   */
  isTrackingTrip(tripId: string): boolean {
    return this.isTracking.get(tripId) || false;
  }

  /**
   * Get number of points recorded for a trip
   */
  getPointsCount(tripId: string): number {
    return this.locationPoints.get(tripId)?.length || 0;
  }
}

// Export singleton instance
export const TripLocationTracker = new TripLocationTrackerService();
