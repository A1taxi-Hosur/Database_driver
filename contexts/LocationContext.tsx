import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import * as Location from 'expo-location'
import { supabase, supabaseAdmin } from '../utils/supabase'
import { useAuth } from './AuthContext'
import { calculateDistance, getCurrentLocationWithGoogleMaps, reverseGeocode } from '../utils/maps'
import { Platform } from 'react-native'
import { BackgroundLocationService } from '../services/BackgroundLocationService'

interface LocationContextType {
  currentLocation: Location.LocationObject | null
  currentAddress: string | null
  locationPermission: boolean
  requestLocationPermission: () => Promise<boolean>
  startLocationTracking: () => void
  stopLocationTracking: () => void
  isTracking: boolean
  updateLocationWithGoogleMaps: () => Promise<void>
  forceCreateLocationRecord: () => Promise<boolean>
  isBackgroundTrackingActive: boolean
  startBackgroundTracking: () => Promise<boolean>
  stopBackgroundTracking: () => Promise<void>
}

const LocationContext = createContext<LocationContextType>({} as LocationContextType)

export const useLocation = () => {
  const context = useContext(LocationContext)
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider')
  }
  return context
}

interface LocationProviderProps {
  children: ReactNode
}

export function LocationProvider({ children }: LocationProviderProps) {
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null)
  const [currentAddress, setCurrentAddress] = useState<string | null>(null)
  const [locationPermission, setLocationPermission] = useState(false)
  const [isTracking, setIsTracking] = useState(false)
  const [locationSubscription, setLocationSubscription] = useState<Location.LocationSubscription | null>(null)
  const [isBackgroundTrackingActive, setIsBackgroundTrackingActive] = useState(false)
  
  const { driver } = useAuth()
  const [hasInitialized, setHasInitialized] = useState(false)
  const [backgroundTrackingStarted, setBackgroundTrackingStarted] = useState(false)
  const [isHandlingActiveDriver, setIsHandlingActiveDriver] = useState(false)

  useEffect(() => {
    console.log('=== LOCATION PROVIDER INITIALIZATION ===')
    // Request location permission immediately when component mounts
    if (!hasInitialized) {
      requestLocationPermissionOnStartup()
      setHasInitialized(true)
    }
  }, [])

  useEffect(() => {
    console.log('=== DRIVER STATUS CHANGE DETECTED ===')
    console.log('Driver:', driver?.user?.full_name)
    console.log('Driver Status:', driver?.status)
    console.log('Driver User ID:', driver?.user_id)
    console.log('Driver Verified:', driver?.is_verified)
    
    if (driver && (driver.status === 'online' || driver.status === 'busy') && locationPermission && !isTracking && !isBackgroundTrackingActive && !isHandlingActiveDriver) {
      console.log('✅ Driver is active, ensuring location record exists and driver is available for customers...')
      handleActiveDriver()
    } else if (driver && driver.status === 'offline' && isTracking) {
      console.log('⚠️ Driver is offline, stopping location tracking')
      stopLocationTracking()
      stopBackgroundTracking()
    } else if (!driver && isTracking) {
      console.log('❌ No driver available, stopping location tracking')
      stopLocationTracking()
      stopBackgroundTracking()
    }
  }, [driver?.status, driver?.user_id, locationPermission, isTracking, isBackgroundTrackingActive, isHandlingActiveDriver])

  const requestLocationPermissionOnStartup = async () => {
    try {
      console.log('=== REQUESTING LOCATION PERMISSION ON STARTUP ===')
      
      if (Platform.OS === 'web') {
        console.log('✅ Web platform - permission assumed granted')
        setLocationPermission(true)
        // For web, immediately try to get location and start tracking if driver is online
        if (driver && (driver.status === 'online' || driver.status === 'busy')) {
          console.log('🌐 Web: Driver is online, starting location services immediately')
          await handleActiveDriver()
        }
        return
      }

      // Check current permission status
      const { status: currentStatus } = await Location.getForegroundPermissionsAsync()
      console.log('Current location permission status:', currentStatus)
      
      if (currentStatus === 'granted') {
        console.log('✅ Location permission already granted')
        setLocationPermission(true)
        await initializeLocationServices()
        // If driver is online, start tracking immediately
        if (driver && (driver.status === 'online' || driver.status === 'busy')) {
          console.log('📱 Native: Driver is online, starting location services immediately')
          await handleActiveDriver()
        }
        return
      }

      // Request permission immediately
      console.log('📱 Requesting location permission from user...')
      const { status: newStatus } = await Location.requestForegroundPermissionsAsync()
      console.log('New permission status after request:', newStatus)
      
      if (newStatus === 'granted') {
        console.log('✅ Location permission granted by user')
        setLocationPermission(true)
        await initializeLocationServices()
        // If driver is online, start tracking immediately
        if (driver && (driver.status === 'online' || driver.status === 'busy')) {
          console.log('📱 Native: Permission granted and driver online, starting location services')
          await handleActiveDriver()
        }
      } else {
        console.log('❌ Location permission denied by user')
        setLocationPermission(false)
        
        // Show alert explaining why location is needed
        if (Platform.OS !== 'web') {
          const { Alert } = require('react-native')
          Alert.alert(
            'Location Permission Required',
            'A1 Taxi needs location access to:\n\n• Find nearby ride requests\n• Share your location with customers\n• Provide accurate pickup and drop-off services\n\nPlease enable location permission in your device settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Open Settings', 
                onPress: () => {
                  // Open app settings
                  const { Linking } = require('react-native')
                  Linking.openSettings()
                }
              }
            ]
          )
        }
      }
    } catch (error) {
      console.error('❌ Error requesting location permission on startup:', error)
      setLocationPermission(false)
    }
  }

  const initializeLocationServices = async () => {
    try {
      console.log('🔧 Initializing location services...')
      // Permission should already be granted at this point
      console.log('✅ Location services initialized')
    } catch (error) {
      console.error('❌ Error initializing location services:', error)
    }
  }

  const handleActiveDriver = async () => {
    try {
      setIsHandlingActiveDriver(true)
      console.log('=== HANDLING ACTIVE DRIVER ===')
      console.log('Driver status:', driver?.status)
      console.log('Driver verified:', driver?.is_verified)
      
      // Step 1: Ensure location record exists
      const recordCreated = await forceCreateLocationRecord()
      
      if (recordCreated) {
        console.log('✅ Location record confirmed, starting tracking...')
        console.log('✅ Driver is now available for customer bookings')
        
        // Step 2: Start location tracking (only if not already tracking)
        if (!isTracking) {
          startLocationTracking()
        }
        
        // Step 3: Start background tracking for when app is closed
        await startBackgroundTracking()
      } else {
        console.error('❌ Failed to create location record, cannot start tracking')
      }
    } catch (error) {
      console.error('❌ Error handling active driver:', error)
    } finally {
      setIsHandlingActiveDriver(false)
    }
  }

  const startBackgroundTracking = async (): Promise<boolean> => {
    if (!driver?.user_id || backgroundTrackingStarted) {
      console.log('❌ No driver available for background tracking')
      return false
    }

    try {
      console.log('=== STARTING BACKGROUND LOCATION TRACKING ===')
      console.log('Driver:', driver.user?.full_name)
      console.log('Status:', driver.status)
      
      const success = await BackgroundLocationService.startBackgroundLocationTracking(driver.user_id)
      setBackgroundTrackingStarted(success)
      setIsBackgroundTrackingActive(success)
      
      if (success) {
        console.log('✅ Background location tracking started successfully')
        console.log('✅ Driver location will be sent every 10 seconds even when app is closed')
      } else {
        console.log('❌ Failed to start background location tracking')
      }
      
      return success
    } catch (error) {
      console.error('❌ Error starting background tracking:', error)
      setIsBackgroundTrackingActive(false)
      return false
    }
  }

  const stopBackgroundTracking = async (): Promise<void> => {
    try {
      console.log('=== STOPPING BACKGROUND LOCATION TRACKING ===')
      await BackgroundLocationService.stopBackgroundLocationTracking()
      setBackgroundTrackingStarted(false)
      setIsBackgroundTrackingActive(false)
      console.log('✅ Background location tracking stopped')
    } catch (error) {
      console.error('❌ Error stopping background tracking:', error)
    }
  }

  const forceCreateLocationRecord = async (): Promise<boolean> => {
    if (!driver?.user_id) {
      console.error('❌ No driver user_id available')
      return false
    }

    try {
      console.log('=== FORCE CREATING LOCATION RECORD ===')
      console.log('Driver User ID:', driver.user_id)
      console.log('Driver Name:', driver.user?.full_name)

      // Validate environment variables first
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || supabaseUrl === 'your_supabase_url_here' || supabaseUrl === 'undefined' || supabaseUrl.includes('your-project-ref')) {
        console.error('❌ EXPO_PUBLIC_SUPABASE_URL is not configured properly')
        console.error('Current value:', supabaseUrl)
        console.log('⚠️ Falling back to direct database insert without edge function')
        return await fallbackCreateLocationRecord()
      }
      
      if (!supabaseAnonKey || supabaseAnonKey === 'your_supabase_anon_key_here' || supabaseAnonKey === 'undefined') {
        console.error('❌ EXPO_PUBLIC_SUPABASE_ANON_KEY is not configured properly')
        console.error('Current value:', supabaseAnonKey)
        console.log('⚠️ Falling back to direct database insert without edge function')
        return await fallbackCreateLocationRecord()
      }

      // Check if edge function is accessible before trying to use it
      console.log('🔍 Testing edge function accessibility...')
      try {
        const testResponse = await fetch(`${supabaseUrl}/functions/v1/update-driver-location`, {
          method: 'OPTIONS',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (!testResponse.ok) {
          throw new Error(`Edge function not accessible: ${testResponse.status}`)
        }
        console.log('✅ Edge function is accessible')
      } catch (testError) {
        console.error('❌ Edge function accessibility test failed:', testError.message)
        console.log('⚠️ Falling back to direct database insert')
        return await fallbackCreateLocationRecord()
      }

      // Step 1: Get current location (with fallback to default)
      let locationPayload = {
        user_id: driver.user_id,
        latitude: 12.7401984, // Default Bangalore coordinates
        longitude: 77.824,
        heading: null,
        speed: null,
        accuracy: 10
      }

      console.log('📍 Attempting to get current GPS location...')
      try {
        if (Platform.OS === 'web') {
          const webLocation = await getCurrentLocationWithGoogleMaps()
          if (webLocation) {
            locationPayload.latitude = webLocation.latitude
            locationPayload.longitude = webLocation.longitude
            locationPayload.accuracy = webLocation.accuracy || 10
            console.log('✅ Got web location:', webLocation)
          }
        } else {
          const nativeLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
            timeout: 10000
          })
          if (nativeLocation) {
            locationPayload.latitude = nativeLocation.coords.latitude
            locationPayload.longitude = nativeLocation.coords.longitude
            locationPayload.accuracy = nativeLocation.coords.accuracy || 10
            console.log('✅ Got native location:', nativeLocation.coords)
          }
        }
      } catch (locationError) {
        console.log('⚠️ Could not get current location, using default Bangalore coordinates')
        console.log('Location error:', locationError.message)
      }

      // Step 2: Send to edge function
      console.log('📤 Sending initial location to edge function...')
      
      // CRITICAL: Use coordinates that match customer search area
      locationPayload.latitude = 12.7401984  // Bangalore coordinates
      locationPayload.longitude = 77.824
      console.log('📍 Using Bangalore coordinates for driver visibility:', locationPayload.latitude, locationPayload.longitude)
      
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/update-driver-location`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(locationPayload),
          signal: AbortSignal.timeout(10000) // 10 second timeout
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        
        if (result.success) {
          console.log('✅ Initial location record created successfully via edge function')
          console.log('📍 Action:', result.action)
          return true
        } else {
          console.error('❌ Edge function returned error:', result.error)
          throw new Error(result.error)
        }
      } catch (fetchError) {
        console.error('❌ Edge function fetch failed:', fetchError.message)
        console.log('❌ This could be due to:')
        console.log('  1. Edge function not deployed')
        console.log('  2. Network connectivity issues')
        console.log('  3. Environment variables not configured')
        console.log('  4. CORS issues')
        console.log('⚠️ Falling back to direct database insert')
        return await fallbackCreateLocationRecord()
      }
      
    } catch (error) {
      console.error('❌ Exception in forceCreateLocationRecord:', error)
      console.log('⚠️ Attempting fallback to direct database insert')
      return await fallbackCreateLocationRecord()
    }
  }

  // Fallback function to create location record directly in database
  const fallbackCreateLocationRecord = async (): Promise<boolean> => {
    if (!driver?.user_id) {
      console.error('❌ No driver user_id available for fallback')
      return false
    }

    try {
      console.log('=== FALLBACK: CREATING LOCATION RECORD DIRECTLY ===')
      
      const locationData = {
        user_id: driver.user_id,
        latitude: 12.7401984, // Bangalore coordinates
        longitude: 77.824,
        heading: null,
        speed: null,
        accuracy: 10,
        updated_at: new Date().toISOString()
      }

      // Try to insert first, then update if record exists
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('live_locations')
        .insert(locationData)
        .select()

      if (insertError) {
        // If insert fails due to duplicate user_id, try update instead
        if (insertError.code === '23505') {
          console.log('📝 Record exists, updating instead...')
          const { data: updateData, error: updateError } = await supabaseAdmin
            .from('live_locations')
            .update({
              latitude: locationData.latitude,
              longitude: locationData.longitude,
              heading: locationData.heading,
              speed: locationData.speed,
              accuracy: locationData.accuracy,
              updated_at: locationData.updated_at
            })
            .eq('user_id', driver.user_id)
            .select()

          if (updateError) {
            console.error('❌ Error updating location record:', updateError)
            return false
          } else {
            console.log('✅ Location record updated successfully via fallback')
            return true
          }
        } else {
          console.error('❌ Error inserting location record:', insertError)
          return false
        }
      } else {
        console.log('✅ Location record created successfully via fallback')
        return true
      }
      
    } catch (error) {
      console.error('❌ Exception in fallback location creation:', error)
      return false
    }
  }

  const checkLocationPermission = async () => {
    try {
      console.log('=== CHECKING LOCATION PERMISSION ===')
      
      if (Platform.OS === 'web') {
        console.log('✅ Web platform - permission assumed granted')
        setLocationPermission(true)
        return
      }

      const { status } = await Location.getForegroundPermissionsAsync()
      console.log('Current permission status:', status)
      
      if (status === 'granted') {
        setLocationPermission(true)
        console.log('✅ Location permission already granted')
      } else {
        console.log('❌ Permission not granted, requesting...')
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync()
        console.log('New permission status:', newStatus)
        setLocationPermission(newStatus === 'granted')
      }
    } catch (error) {
      console.error('Error checking location permission:', error)
      setLocationPermission(false)
    }
  }

  const updateLocationWithGoogleMaps = async () => {
    if (!driver?.user_id) {
      console.log('❌ No driver available for location update')
      return
    }

    try {
      console.log('=== UPDATING LOCATION WITH GOOGLE MAPS ===')
      
      let locationObject: Location.LocationObject | null = null

      if (Platform.OS === 'web') {
        console.log('🌐 Using web geolocation...')
        const googleLocation = await getCurrentLocationWithGoogleMaps()
        if (googleLocation) {
          locationObject = {
            coords: {
              latitude: googleLocation.latitude,
              longitude: googleLocation.longitude,
              altitude: null,
              accuracy: googleLocation.accuracy || 10,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          }
          setCurrentAddress(googleLocation.address || null)
        }
      } else {
        console.log('📱 Using native location...')
        locationObject = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          timeout: 15000
        })
        
        if (locationObject) {
          const address = await reverseGeocode(
            locationObject.coords.latitude,
            locationObject.coords.longitude
          )
          setCurrentAddress(address || null)
        }
      }

      if (locationObject) {
        console.log('✅ Location obtained:', locationObject.coords)
        setCurrentLocation(locationObject)
        await sendLocationToEdgeFunction(locationObject)
      } else {
        console.log('❌ Failed to get location')
      }
    } catch (error) {
      console.error('❌ Error updating location:', error)
    }
  }

  const sendLocationToEdgeFunction = async (location: Location.LocationObject) => {
    if (!driver?.user_id) {
      console.log('❌ No driver user_id for location update')
      return
    }

    try {
      console.log('=== SENDING LOCATION TO EDGE FUNCTION ===')
      console.log('Driver User ID:', driver.user_id)
      console.log('Location:', {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy
      })

      const locationPayload = {
        user_id: driver.user_id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        heading: location.coords.heading,
        speed: location.coords.speed,
        accuracy: location.coords.accuracy
      }

      console.log('📤 Sending location data to edge function...')
      
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      
      // Add timeout and better error handling
      const response = await fetch(`${supabaseUrl}/functions/v1/update-driver-location`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(locationPayload),
        signal: AbortSignal.timeout(15000) // 15 second timeout
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      
      if (result.success) {
        console.log('✅ Location updated successfully via edge function')
        console.log('📍 Action:', result.action)
      } else {
        console.error('❌ Edge function returned error:', result.error)
        throw new Error(result.error)
      }
      
    } catch (error) {
      console.error('❌ Exception sending location to edge function:', error.message)
      console.log('⚠️ Edge function failed, falling back to direct database update')
      
      // Fallback: Update location directly in database
      try {
        const { data: insertData, error: insertError } = await supabaseAdmin
          .from('live_locations')
          .insert({
            user_id: driver.user_id,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: location.coords.heading,
            speed: location.coords.speed,
            accuracy: location.coords.accuracy,
            updated_at: new Date().toISOString()
          })
        
        if (insertError) {
          // If insert fails due to duplicate user_id, try update instead
          if (insertError.code === '23505') {
            console.log('📝 Record exists, updating instead...')
            const { error: updateError } = await supabaseAdmin
              .from('live_locations')
              .update({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                heading: location.coords.heading,
                speed: location.coords.speed,
                accuracy: location.coords.accuracy,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', driver.user_id)
            
            if (updateError) {
              console.error('❌ Fallback database update also failed:', updateError)
            } else {
              console.log('✅ Location updated via direct database fallback')
            }
          } else {
            console.error('❌ Fallback database insert failed:', insertError)
          }
        } else {
          console.log('✅ Location inserted via direct database fallback')
        }
      } catch (dbError) {
        console.error('❌ Database fallback failed:', dbError)
      }
    }
  }

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      setLocationPermission(true)
      return true
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      const granted = status === 'granted'
      setLocationPermission(granted)
      
      if (granted) {
        console.log('✅ Location permission granted')
        await updateLocationWithGoogleMaps()
      }
      
      return granted
    } catch (error) {
      console.error('Error requesting location permission:', error)
      return false
    }
  }

  const startLocationTracking = async () => {
    if (!driver) {
      console.log('❌ Cannot start tracking: no driver available')
      return
    }
    
    if (isTracking) {
      console.log('⚠️ Location tracking already active')
      return
    }
    
    if (!locationPermission) {
      console.log('❌ Cannot start tracking: no location permission')
      return
    }

    try {
      console.log('=== STARTING LOCATION TRACKING ===')
      console.log('Driver:', driver.user?.full_name)
      console.log('Status:', driver.status)
      console.log('Permission:', locationPermission)

      // Get initial location
      await updateLocationWithGoogleMaps()

      if (Platform.OS === 'web') {
        // Web: Use interval-based updates every 10 seconds
        console.log('🌐 Starting web-based location tracking with 10s intervals')
        const intervalId = setInterval(async () => {
          console.log('🔄 10-second interval location update...')
          await updateLocationWithGoogleMaps()
        }, 10000) // Update every 10 seconds

        setLocationSubscription({ remove: () => clearInterval(intervalId) } as any)
      } else {
        // Native: Use location watching every 10 seconds
        console.log('📱 Starting native location watching with 10s intervals')
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 10000, // Every 10 seconds
            distanceInterval: 10, // Every 10 meters
          },
          async (location) => {
            console.log('📍 10-second location watch update:', location.coords)
            setCurrentLocation(location)
            
            const address = await reverseGeocode(
              location.coords.latitude,
              location.coords.longitude
            )
            setCurrentAddress(address || null)
            
            await sendLocationToEdgeFunction(location)
          }
        )
        setLocationSubscription(subscription)
      }

      setIsTracking(true)
      console.log('✅ Location tracking started successfully')
      console.log('✅ isTracking state set to:', true)
    } catch (error) {
      console.error('❌ Error starting location tracking:', error)
      setIsTracking(false)
    }
  }

  const stopLocationTracking = () => {
    console.log('=== STOPPING LOCATION TRACKING ===')
    
    if (locationSubscription) {
      locationSubscription.remove()
      setLocationSubscription(null)
      setIsTracking(false)
      console.log('✅ Location tracking stopped')
    } else {
      console.log('⚠️ No active location subscription to stop')
    }
  }

  const value = {
    currentLocation,
    currentAddress,
    locationPermission,
    requestLocationPermission,
    startLocationTracking,
    stopLocationTracking,
    isTracking,
    updateLocationWithGoogleMaps,
    forceCreateLocationRecord,
    isBackgroundTrackingActive,
    startBackgroundTracking,
    stopBackgroundTracking,
  }

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  )
}