import Constants from 'expo-constants';

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface DirectionsResult {
  distance: number; // in kilometers
  duration: number; // in seconds
  polyline?: string;
}

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || '';

/**
 * Google Maps service for calculating distances and routes
 */
export const googleMapsService = {
  /**
   * Get directions and distance between two points using Google Maps Directions API
   * Returns numeric distance in kilometers and duration in seconds
   */
  async getDirections(
    origin: Coordinates,
    destination: Coordinates
  ): Promise<DirectionsResult | null> {
    try {
      if (!GOOGLE_MAPS_API_KEY) {
        console.warn('⚠️ Google Maps API key not available for directions');
        return null;
      }

      // Include alternatives=true to get multiple route options
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&alternatives=true&key=${GOOGLE_MAPS_API_KEY}`;

      console.log('📡 Calling Google Maps Directions API...');
      console.log('📍 Origin:', origin);
      console.log('📍 Destination:', destination);
      const response = await fetch(url);

      if (!response.ok) {
        console.error('❌ Google Maps API returned error:', response.status, response.statusText);
        return null;
      }

      const data = await response.json();

      if (data.status === 'OK' && data.routes.length > 0) {
        // Log all available routes
        console.log(`📊 Found ${data.routes.length} route(s):`);
        data.routes.forEach((route: any, index: number) => {
          const leg = route.legs[0];
          console.log(`  Route ${index + 1}: ${(leg.distance.value / 1000).toFixed(2)} km, ${Math.round(leg.duration.value / 60)} min`);
        });

        // Use the first route (usually the recommended one)
        const route = data.routes[0];
        const leg = route.legs[0];

        // Convert distance from meters to kilometers
        const distanceKm = leg.distance.value / 1000;
        // Duration is already in seconds
        const durationSec = leg.duration.value;

        console.log('✅ Google Maps Directions result (using Route 1):', {
          distance: `${distanceKm.toFixed(2)} km`,
          duration: `${Math.round(durationSec / 60)} min`,
          distanceMeters: leg.distance.value,
          durationSeconds: durationSec,
          startAddress: leg.start_address,
          endAddress: leg.end_address
        });

        return {
          distance: distanceKm,
          duration: durationSec,
          polyline: route.overview_polyline?.points,
        };
      }

      console.error('❌ Google Maps API returned no routes or bad status:', data.status);
      return null;
    } catch (error) {
      console.error('❌ Error getting directions from Google Maps:', error);
      return null;
    }
  },

  /**
   * Calculate straight-line distance between two points (Haversine formula)
   * Fallback when Google Maps API is not available
   */
  calculateStraightLineDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(coord2.latitude - coord1.latitude);
    const dLon = this.toRadians(coord2.longitude - coord1.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(coord1.latitude)) * Math.cos(this.toRadians(coord2.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  },

  toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
};
