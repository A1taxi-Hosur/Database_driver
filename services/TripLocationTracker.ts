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
   * Calculate total distance traveled from GPS breadcrumbs using Google Maps API
   */
  async calculateTripDistance(
    tripId: string,
    tripType: 'regular' | 'scheduled'
  ): Promise<{ distanceKm: number; pointsUsed: number }> {
    try {
      console.log('=== CALCULATING TRIP DISTANCE FROM GPS (Google Maps API) ===');
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

      console.log(`📊 Calculating distance from ${locationHistory.length} GPS points using Google Maps API`);

      // Filter out GPS points that are too close together or have unrealistic jumps
      const filteredPoints = this.filterGPSPoints(locationHistory);
      console.log(`📍 Filtered to ${filteredPoints.length} waypoints`);

      if (filteredPoints.length < 2) {
        console.warn('⚠️ Not enough filtered GPS points');
        return { distanceKm: 0, pointsUsed: 0 };
      }

      // Calculate distance using Google Maps Directions API
      const totalDistanceKm = await this.calculateDistanceViaGoogleMaps(filteredPoints);

      console.log('✅ GPS Distance Calculation (Google Maps):', {
        totalDistanceKm: totalDistanceKm.toFixed(2),
        pointsUsed: locationHistory.length,
        filteredWaypoints: filteredPoints.length,
        method: 'Google Maps Directions API'
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
   * Filter GPS points to remove noise and keep significant waypoints
   */
  private filterGPSPoints(points: any[]): any[] {
    if (points.length <= 2) return points;

    const filtered: any[] = [points[0]]; // Always include first point

    for (let i = 1; i < points.length - 1; i++) {
      const prevPoint = filtered[filtered.length - 1];
      const currentPoint = points[i];

      // Calculate distance from previous filtered point
      const distance = this.calculateHaversineDistance(
        parseFloat(prevPoint.latitude.toString()),
        parseFloat(prevPoint.longitude.toString()),
        parseFloat(currentPoint.latitude.toString()),
        parseFloat(currentPoint.longitude.toString())
      );

      // Include point if it's at least 50 meters away (0.05 km) and less than 500 meters (avoid GPS jumps)
      if (distance >= 0.05 && distance < 0.5) {
        filtered.push(currentPoint);
      }
    }

    filtered.push(points[points.length - 1]); // Always include last point

    return filtered;
  }

  /**
   * Calculate distance using Google Maps Directions API with waypoints
   */
  private async calculateDistanceViaGoogleMaps(points: any[]): Promise<number> {
    try {
      // Import GOOGLE_MAPS_API_KEY
      const Constants = await import('expo-constants');
      const GOOGLE_MAPS_API_KEY = Constants.default.expoConfig?.extra?.googleMapsApiKey || '';

      if (!GOOGLE_MAPS_API_KEY) {
        console.warn('⚠️ Google Maps API key not available, falling back to Haversine');
        return this.calculateDistanceHaversine(points);
      }

      // Google Maps API limits: max 25 waypoints per request
      // We'll batch the points and sum the distances
      const MAX_WAYPOINTS_PER_REQUEST = 23; // Leave room for origin and destination
      let totalDistanceMeters = 0;

      // Split points into batches
      for (let i = 0; i < points.length - 1; i += MAX_WAYPOINTS_PER_REQUEST) {
        const batchEnd = Math.min(i + MAX_WAYPOINTS_PER_REQUEST + 1, points.length);
        const batchPoints = points.slice(i, batchEnd);

        if (batchPoints.length < 2) continue;

        const origin = `${batchPoints[0].latitude},${batchPoints[0].longitude}`;
        const destination = `${batchPoints[batchPoints.length - 1].latitude},${batchPoints[batchPoints.length - 1].longitude}`;

        // Create waypoints string (exclude first and last)
        let waypoints = '';
        if (batchPoints.length > 2) {
          const waypointCoords = batchPoints
            .slice(1, -1)
            .map((p: any) => `${p.latitude},${p.longitude}`)
            .join('|');
          waypoints = `&waypoints=${waypointCoords}`;
        }

        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypoints}&key=${GOOGLE_MAPS_API_KEY}`;

        console.log(`📡 Calling Google Maps API (batch ${Math.floor(i / MAX_WAYPOINTS_PER_REQUEST) + 1}, ${batchPoints.length} points)...`);

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.routes.length > 0) {
          const route = data.routes[0];

          // Sum up all leg distances
          for (const leg of route.legs) {
            totalDistanceMeters += leg.distance.value;
          }

          console.log(`✅ Batch distance: ${(totalDistanceMeters / 1000).toFixed(2)} km`);
        } else {
          console.warn(`⚠️ Google Maps API error for batch: ${data.status}`, data.error_message);
          // Fall back to Haversine for this batch
          const batchDistance = this.calculateDistanceHaversine(batchPoints);
          totalDistanceMeters += batchDistance * 1000; // Convert km to meters
        }

        // Add small delay to avoid rate limiting
        if (i + MAX_WAYPOINTS_PER_REQUEST < points.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      return totalDistanceMeters / 1000; // Convert meters to kilometers
    } catch (error) {
      console.error('❌ Error using Google Maps API, falling back to Haversine:', error);
      return this.calculateDistanceHaversine(points);
    }
  }

  /**
   * Fallback: Calculate distance using Haversine formula
   */
  private calculateDistanceHaversine(points: any[]): number {
    let totalDistanceKm = 0;

    for (let i = 1; i < points.length; i++) {
      const point1 = points[i - 1];
      const point2 = points[i];

      const distance = this.calculateHaversineDistance(
        parseFloat(point1.latitude.toString()),
        parseFloat(point1.longitude.toString()),
        parseFloat(point2.latitude.toString()),
        parseFloat(point2.longitude.toString())
      );

      totalDistanceKm += distance;
    }

    return totalDistanceKm;
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
