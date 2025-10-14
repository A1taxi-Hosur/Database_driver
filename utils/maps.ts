import Constants from 'expo-constants';

export const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || '';

/**
 * Open Google Maps with navigation to a specific destination
 */
export async function openGoogleMapsNavigation(
  destinationLat: number,
  destinationLng: number,
  destinationAddress?: string
): Promise<void> {
  try {
    const destination = `${destinationLat},${destinationLng}`;
    const label = destinationAddress ? encodeURIComponent(destinationAddress) : 'Destination';
    
    // For web, open Google Maps in a new tab
    if (typeof window !== 'undefined') {
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&destination_place_id=${label}`;
      window.open(mapsUrl, '_blank');
      return;
    }
    
    // For mobile, use deep linking
    const { Linking } = require('react-native');
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
    
    const canOpen = await Linking.canOpenURL(mapsUrl);
    if (canOpen) {
      await Linking.openURL(mapsUrl);
    } else {
      console.error('Cannot open Google Maps');
    }
  } catch (error) {
    console.error('Error opening Google Maps navigation:', error);
  }
}

/**
 * Get directions between two points using Google Maps Directions API
 */
export async function getDirections(
  origin: Coordinates,
  destination: Coordinates
): Promise<{
  routes: any[];
  distance: string;
  duration: string;
  polyline?: string;
} | null> {
  try {
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('Google Maps API key not available for directions');
      return null;
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    const data = await response.json();
    
    if (data.status === 'OK' && data.routes.length > 0) {
      const route = data.routes[0];
      const leg = route.legs[0];
      
      return {
        routes: data.routes,
        distance: leg.distance.text,
        duration: leg.duration.text,
        polyline: route.overview_polyline?.points,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting directions:', error);
    return null;
  }
}

/**
 * Get current location using Google Maps Geolocation API
 * Falls back to Expo Location if Google Maps fails
 */
export async function getCurrentLocationWithGoogleMaps(): Promise<{
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string;
} | null> {
  try {
    console.log('=== GETTING LOCATION WITH GOOGLE MAPS ===')
    console.log('Checking if geolocation is supported...')
    
    if (!navigator.geolocation) {
      console.error('❌ Geolocation not supported by browser')
      return null
    }
    
    console.log('✅ Geolocation supported, requesting position...')
    
    // First try to get location using browser's geolocation
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('✅ Geolocation success:', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          })
          resolve(pos)
        },
        (error) => {
          console.error('❌ Geolocation error:', error.message)
          reject(error)
        },
        {
          enableHighAccuracy: true,
          timeout: 15000, // Increased timeout
          maximumAge: 30000, // Reduced cache time
        }
      );
    });

    const coords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };

    console.log('✅ Final coordinates:', coords)
    
    // Get address using reverse geocoding
    console.log('Getting address via reverse geocoding...')
    const address = await reverseGeocode(coords.latitude, coords.longitude);
    console.log('✅ Address result:', address)
    
    return {
      ...coords,
      address,
    };
  } catch (error) {
    console.error('❌ Error getting location with Google Maps:', error.message || error);
    return null;
  }
}

/**
 * Reverse geocode coordinates to get human-readable address
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | undefined> {
  try {
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('Google Maps API key not found, using coordinates');
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'OK' && data.results.length > 0) {
        return data.results[0].formatted_address;
      } else {
        console.warn('Reverse geocoding failed:', data.status, data.error_message);
        return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      }
    } catch (fetchError) {
      console.warn('Google Maps API request failed:', fetchError);
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }
  } catch (error) {
    console.warn('Error reverse geocoding:', error);
    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  }
}

/**
 * Get autocomplete suggestions for addresses
 */
export async function getPlaceAutocomplete(input: string): Promise<Array<{
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
}>> {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_API_KEY}&components=country:in`
    );
    
    const data = await response.json();
    
    if (data.status === 'OK') {
      return data.predictions.map((prediction: any) => ({
        place_id: prediction.place_id,
        description: prediction.description,
        main_text: prediction.structured_formatting.main_text,
        secondary_text: prediction.structured_formatting.secondary_text,
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error getting place autocomplete:', error);
    return [];
  }
}

/**
 * Get place details from place_id
 */
export async function getPlaceDetails(placeId: string): Promise<{
  latitude: number;
  longitude: number;
  address: string;
} | null> {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    const data = await response.json();
    
    if (data.status === 'OK' && data.result) {
      return {
        latitude: data.result.geometry.location.lat,
        longitude: data.result.geometry.location.lng,
        address: data.result.formatted_address,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting place details:', error);
    return null;
  }
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(coord2.latitude - coord1.latitude);
  const dLon = toRadians(coord2.longitude - coord1.longitude);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.latitude)) * Math.cos(toRadians(coord2.latitude)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if driver is within proximity radius of pickup location
 */
export function isDriverNearby(
  driverLocation: Coordinates,
  pickupLocation: Coordinates,
  radiusKm: number = 5
): boolean {
  const distance = calculateDistance(driverLocation, pickupLocation);
  return distance <= radiusKm;
}

/**
 * Get estimated time and distance using Google Maps API
 */
export async function getRouteInfo(
  origin: Coordinates,
  destination: Coordinates
): Promise<{ distance: string; duration: string; distanceValue: number; durationValue: number } | null> {
  try {
    console.log('🗺️ getRouteInfo called with:', { origin, destination });

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 'https://whubaypabojomdyfqxcf.supabase.co';
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndodWJheXBhYm9qb21keWZxeGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3MDYwMzEsImV4cCI6MjA3MjI4MjAzMX0.0LUHKqX1wdFnmk3KRdyv1lceMxurg_OksZKQ1apn0og';

    const url = `${supabaseUrl}/functions/v1/calculate-distance`;
    console.log('📡 Calling edge function:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ origin, destination }),
    });

    console.log('📥 Edge function response status:', response.status);

    if (!response.ok) {
      console.error('❌ Edge function returned error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('❌ Error details:', errorText);
      return null;
    }

    const data = await response.json();
    console.log('✅ Distance calculation result from edge function:', data);

    if (data.distanceValue && data.durationValue) {
      return {
        distance: data.distance,
        duration: data.duration,
        distanceValue: data.distanceValue,
        durationValue: data.durationValue,
      };
    }

    console.warn('⚠️ Edge function returned incomplete data:', data);
    return null;
  } catch (error) {
    console.error('❌ Error in getRouteInfo:', error);
    console.error('❌ Error message:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}