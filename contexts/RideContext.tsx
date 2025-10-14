import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase, supabaseAdmin } from '../utils/supabase'
import { useAuth } from './AuthContext'
import { FareCalculationService } from '../services/FareCalculationService'

type Ride = {
  id: string
  ride_code: string
  customer_id: string
  driver_id: string | null
  pickup_latitude: number
  pickup_longitude: number
  pickup_address: string
  pickup_landmark: string | null
  destination_latitude: number
  destination_longitude: number
  destination_address: string
  destination_landmark: string | null
  status: 'requested' | 'accepted' | 'driver_arrived' | 'in_progress' | 'completed' | 'cancelled'
  fare_amount: number | null
  distance_km: number | null
  duration_minutes: number | null
  payment_status: 'pending' | 'completed' | 'failed'
  payment_method: 'cash' | 'card' | 'wallet'
  rating: number | null
  feedback: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  booking_type: 'regular' | 'rental' | 'outstation' | 'airport'
  vehicle_type: string
  rental_hours: number | null
  pickup_otp: string | null
  drop_otp: string | null
  created_at: string
  updated_at: string
  scheduled_time: string | null
  customer?: {
    id: string
    full_name: string
    phone_number: string
    email: string
  }
}

interface RideContextType {
  currentRide: Ride | null
  pendingRides: Ride[]
  loading: boolean
  error: string | null
  acceptRide: (rideId: string) => Promise<boolean>
  declineRide: (rideId: string) => Promise<void>
  markDriverArrived: (rideId: string) => Promise<void>
  generatePickupOTP: (rideId: string) => Promise<string | null>
  verifyPickupOTP: (rideId: string, otp: string) => Promise<boolean>
  startRide: (rideId: string) => Promise<void>
  generateDropOTP: (rideId: string) => Promise<string | null>
  completeRide: (rideId: string) => Promise<{ success: boolean; completionData?: any }>
  cancelRide: (rideId: string, reason: string) => Promise<void>
  refreshRides: () => Promise<void>
  clearError: () => void
}

const RideContext = createContext<RideContextType>({} as RideContextType)

export const useRide = () => {
  const context = useContext(RideContext)
  if (!context) {
    throw new Error('useRide must be used within a RideProvider')
  }
  return context
}

interface RideProviderProps {
  children: ReactNode
}

export function RideProvider({ children }: RideProviderProps) {
  const [currentRide, setCurrentRide] = useState<Ride | null>(null)
  const [pendingRides, setPendingRides] = useState<Ride[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { driver, updateDriverStatus } = useAuth()

  useEffect(() => {
    if (driver) {
      console.log('=== RIDE CONTEXT INITIALIZED ===')
      console.log('Driver:', driver.user?.full_name)
      console.log('Driver ID:', driver.id)
      console.log('Driver Status:', driver.status)

      // Load initial rides
      loadRides()

      // Set up real-time subscriptions
      setupRealTimeSubscriptions()

      // Set up auto-refresh every 2 seconds
      const refreshInterval = setInterval(() => {
        console.log('🔄 Auto-refreshing rides (2-second interval)...')
        loadRides()
      }, 2000)

      return () => {
        console.log('🛑 Cleaning up auto-refresh interval')
        clearInterval(refreshInterval)
      }
    }
  }, [driver])

  const setupRealTimeSubscriptions = () => {
    if (!driver) return

    console.log('=== SETTING UP REAL-TIME SUBSCRIPTIONS ===')
    console.log('Driver User ID:', driver.user_id)
    console.log('Driver ID:', driver.id)

    // Subscribe to ride changes for this driver
    const rideSubscription = supabase
      .channel('driver-rides')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rides',
          filter: `driver_id=eq.${driver.id}`
        },
        (payload) => {
          console.log('🔔 Real-time ride update for driver:', payload)
          handleRideUpdate(payload)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${driver.user_id}`
        },
        (payload) => {
          console.log('🔔 Real-time notification for driver:', payload)
          handleNotificationUpdate(payload)
        }
      )
      .subscribe()

    console.log('✅ Real-time subscriptions established')

    return () => {
      console.log('🔌 Cleaning up real-time subscriptions')
      rideSubscription.unsubscribe()
    }
  }

  const handleRideUpdate = (payload: any) => {
    console.log('=== HANDLING RIDE UPDATE ===')
    console.log('Event type:', payload.eventType)
    console.log('Ride data:', payload.new || payload.old)

    if (payload.eventType === 'UPDATE' && payload.new) {
      const updatedRide = payload.new
      
      // Update current ride if it matches
      setCurrentRide(prev => {
        if (prev && prev.id === updatedRide.id) {
          console.log('✅ Updating current ride via real-time')
          return { ...prev, ...updatedRide }
        }
        return prev
      })
    }
  }

  const handleNotificationUpdate = async (payload: any) => {
    console.log('=== HANDLING NOTIFICATION UPDATE ===')
    console.log('Notification payload:', payload)

    if (payload.eventType === 'INSERT' && payload.new) {
      const notification = payload.new
      
      if (notification.type === 'ride_request' && notification.data?.ride_id) {
        console.log('🚗 New ride request notification received')
        console.log('Ride ID from notification:', notification.data.ride_id)
        
        // Refresh rides to get the new request
        await loadRides()
      }
    }
  }

  const loadRides = async () => {
    if (!driver) return

    try {
      console.log('=== LOADING RIDES ===')
      console.log('Driver ID:', driver.id)
      console.log('Driver User ID:', driver.user_id)
      
      setLoading(true)

      // Load current ride (accepted, in_progress, driver_arrived)
      console.log('🔍 Loading current ride...')
      const { data: currentRideData, error: currentRideError } = await supabaseAdmin
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
        .eq('driver_id', driver.id)
        .in('status', ['accepted', 'driver_arrived', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)

      if (currentRideError) {
        console.error('Error loading current ride:', currentRideError)
      } else {
        const ride = currentRideData && currentRideData.length > 0 ? currentRideData[0] : null
        setCurrentRide(ride)
        console.log('✅ Current ride loaded:', ride ? {
          id: ride.id,
          status: ride.status,
          pickup: ride.pickup_address,
          destination: ride.destination_address
        } : 'none')
      }

      // Load pending rides (notifications for this driver)
      console.log('🔍 Loading pending ride notifications...')
      const { data: notifications, error: notificationsError } = await supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('user_id', driver.user_id)
        .eq('type', 'ride_request')
        .eq('status', 'unread')
        .order('created_at', { ascending: false })

      if (notificationsError) {
        console.error('Error loading notifications:', notificationsError)
        setPendingRides([])
      } else {
        console.log(`📋 Found ${notifications?.length || 0} unread ride notifications`)

        if (notifications && notifications.length > 0) {
          // Get all ride IDs from notifications
          const rideIds = notifications
            .filter(n => n.data?.ride_id)
            .map(n => n.data.ride_id)

          // Fetch actual rides from database to validate they still exist
          const { data: actualRides, error: ridesError } = await supabaseAdmin
            .from('rides')
            .select('id, status, driver_id')
            .in('id', rideIds)
            .eq('status', 'requested')
            .is('driver_id', null)

          if (ridesError) {
            console.error('Error validating rides:', ridesError)
          }

          // Create a Set of valid ride IDs
          const validRideIds = new Set(actualRides?.map(r => r.id) || [])
          console.log(`✅ ${validRideIds.size} rides are still valid and available`)

          // Only show notifications for rides that still exist and are available
          const validNotifications = notifications.filter(n => validRideIds.has(n.data?.ride_id))

          // Auto-cleanup invalid notifications
          const invalidNotifications = notifications.filter(n => !validRideIds.has(n.data?.ride_id))
          if (invalidNotifications.length > 0) {
            console.log(`🧹 Cleaning up ${invalidNotifications.length} invalid notifications`)
            const invalidNotifIds = invalidNotifications.map(n => n.id)
            await supabaseAdmin
              .from('notifications')
              .update({ status: 'read' })
              .in('id', invalidNotifIds)
          }

          // Convert valid notifications to ride objects
          // Only show regular rides in pendingRides - rental/outstation/airport are admin-assigned
          const rideRequests = validNotifications
            .filter(n => n.data?.ride_id && n.data?.booking_type === 'regular')
            .map(n => ({
              id: n.data.ride_id,
              ride_code: n.data.ride_code || 'N/A',
              customer_id: n.data.customer_id,
              driver_id: null,
              pickup_latitude: n.data.pickup_latitude,
              pickup_longitude: n.data.pickup_longitude,
              pickup_address: n.data.pickup_address,
              pickup_landmark: n.data.pickup_landmark,
              destination_latitude: n.data.destination_latitude,
              destination_longitude: n.data.destination_longitude,
              destination_address: n.data.destination_address,
              destination_landmark: n.data.destination_landmark,
              status: 'requested' as const,
              fare_amount: n.data.fare_amount,
              distance_km: null,
              duration_minutes: null,
              payment_status: 'pending' as const,
              payment_method: 'cash' as const,
              rating: null,
              feedback: null,
              cancelled_by: null,
              cancellation_reason: null,
              booking_type: n.data.booking_type || 'regular' as const,
              vehicle_type: n.data.vehicle_type || 'sedan',
              rental_hours: n.data.rental_hours,
              pickup_otp: null,
              drop_otp: null,
              created_at: n.created_at,
              updated_at: n.updated_at || n.created_at,
              scheduled_time: null,
              customer: {
                id: n.data.customer_id,
                full_name: n.data.customer_name || 'Customer',
                phone_number: n.data.customer_phone || '',
                email: ''
              }
            }))

          setPendingRides(rideRequests)
          console.log('✅ Pending rides loaded:', rideRequests.length)
        } else {
          setPendingRides([])
          console.log('✅ No pending ride notifications')
        }
      }

    } catch (error) {
      console.error('Exception loading rides:', error)
      setError('Failed to load rides')
    } finally {
      setLoading(false)
    }
  }

  const acceptRide = async (rideId: string): Promise<boolean> => {
    if (!driver) return false

    try {
      console.log('=== ACCEPTING RIDE ===')
      console.log('Ride ID:', rideId)
      console.log('Driver ID:', driver.id)

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const response = await fetch(`${supabaseUrl}/functions/v1/driver-api/accept-ride`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          ride_id: rideId,
          driver_id: driver.id
        })
      })

      const result = await response.json()
      
      if (result.success) {
        console.log('✅ Ride accepted successfully')
        
        // Update driver status to busy
        await updateDriverStatus('busy')
        
        // Mark notification as read
        await supabaseAdmin
          .from('notifications')
          .update({ status: 'read' })
          .eq('user_id', driver.user_id)
          .eq('type', 'ride_request')
          .contains('data', { ride_id: rideId })

        // Refresh rides to get updated data
        await loadRides()
        
        return true
      } else {
        console.error('❌ Failed to accept ride:', result.error)
        setError(result.error)
        return false
      }
    } catch (error) {
      console.error('Exception accepting ride:', error)
      setError('Failed to accept ride')
      return false
    }
  }

  const declineRide = async (rideId: string): Promise<void> => {
    if (!driver) return

    try {
      console.log('=== DECLINING RIDE ===')
      console.log('Ride ID:', rideId)

      // Mark notification as read (declined)
      await supabaseAdmin
        .from('notifications')
        .update({ status: 'read' })
        .eq('user_id', driver.user_id)
        .eq('type', 'ride_request')
        .contains('data', { ride_id: rideId })

      // Remove from pending rides
      setPendingRides(prev => prev.filter(ride => ride.id !== rideId))
      
      console.log('✅ Ride declined')
    } catch (error) {
      console.error('Exception declining ride:', error)
      setError('Failed to decline ride')
    }
  }

  const markDriverArrived = async (rideId: string): Promise<void> => {
    if (!driver) return

    try {
      console.log('=== MARKING DRIVER ARRIVED ===')
      console.log('Ride ID:', rideId)

      const { data: updatedRide, error } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'driver_arrived',
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .eq('driver_id', driver.id)
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            id,
            full_name,
            phone_number,
            email
          )
        `)
        .single()

      if (error) {
        console.error('Error marking driver arrived:', error)
        setError('Failed to mark as arrived')
        return
      }

      setCurrentRide(updatedRide)
      console.log('✅ Driver marked as arrived')
    } catch (error) {
      console.error('Exception marking driver arrived:', error)
      setError('Failed to mark as arrived')
    }
  }

  const generatePickupOTP = async (rideId: string): Promise<string | null> => {
    try {
      console.log('=== GENERATING PICKUP OTP ===')
      console.log('Ride ID:', rideId)

      const otp = Math.floor(1000 + Math.random() * 9000).toString()
      
      const { error } = await supabaseAdmin
        .from('rides')
        .update({
          pickup_otp: otp,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)

      if (error) {
        console.error('Error generating pickup OTP:', error)
        setError('Failed to generate OTP')
        return null
      }

      console.log('✅ Pickup OTP generated:', otp)
      return otp
    } catch (error) {
      console.error('Exception generating pickup OTP:', error)
      setError('Failed to generate OTP')
      return null
    }
  }

  const verifyPickupOTP = async (rideId: string, otp: string): Promise<boolean> => {
    try {
      console.log('=== VERIFYING PICKUP OTP ===')
      console.log('Ride ID:', rideId)
      console.log('OTP:', otp)

      const { data: ride, error } = await supabaseAdmin
        .from('rides')
        .select('pickup_otp')
        .eq('id', rideId)
        .single()

      if (error || !ride) {
        console.error('Error fetching ride for OTP verification:', error)
        setError('Failed to verify OTP')
        return false
      }

      if (ride.pickup_otp !== otp) {
        setError('Incorrect OTP. Please try again.')
        return false
      }

      // Start the ride
      await startRide(rideId)
      console.log('✅ Pickup OTP verified and ride started')
      return true
    } catch (error) {
      console.error('Exception verifying pickup OTP:', error)
      setError('Failed to verify OTP')
      return false
    }
  }

  const startRide = async (rideId: string): Promise<void> => {
    if (!driver) return

    try {
      console.log('=== STARTING RIDE ===')
      console.log('Ride ID:', rideId)

      const { data: updatedRide, error } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .eq('driver_id', driver.id)
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            id,
            full_name,
            phone_number,
            email
          )
        `)
        .single()

      if (error) {
        console.error('Error starting ride:', error)
        setError('Failed to start ride')
        return
      }

      setCurrentRide(updatedRide)
      console.log('✅ Ride started successfully')
    } catch (error) {
      console.error('Exception starting ride:', error)
      setError('Failed to start ride')
    }
  }

  const generateDropOTP = async (rideId: string): Promise<string | null> => {
    try {
      console.log('=== GENERATING DROP OTP ===')
      console.log('Ride ID:', rideId)

      const otp = Math.floor(1000 + Math.random() * 9000).toString()
      
      const { error } = await supabaseAdmin
        .from('rides')
        .update({
          drop_otp: otp,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)

      if (error) {
        console.error('Error generating drop OTP:', error)
        setError('Failed to generate OTP')
        return null
      }

      console.log('✅ Drop OTP generated:', otp)
      return otp
    } catch (error) {
      console.error('Exception generating drop OTP:', error)
      setError('Failed to generate OTP')
      return null
    }
  }

  const completeRide = async (rideId: string): Promise<{ success: boolean; completionData?: any }> => {
    if (!driver) {
      console.error('❌ No driver available for ride completion')
      return { success: false }
    }

    try {
      console.log('🚨 === COMPLETE RIDE FUNCTION CALLED ===')
      console.log('🚨 Ride ID:', rideId)
      console.log('🚨 Driver ID:', driver.id)
      console.log('🚨 Driver User ID:', driver.user_id)

      // Get current ride details
      const { data: ride, error: rideError } = await supabaseAdmin
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
        .eq('id', rideId)
        .single()

      if (rideError || !ride) {
        console.error('❌ Error fetching ride for completion:', rideError)
        setError('Failed to fetch ride details')
        return { success: false }
      }

      console.log('✅ Ride details fetched for completion:', {
        id: ride.id,
        status: ride.status,
        booking_type: ride.booking_type,
        vehicle_type: ride.vehicle_type,
        pickup: ride.pickup_address,
        destination: ride.destination_address
      })

      // Calculate actual road distance using Google Maps Distance Matrix API
      const pickupLat = parseFloat(ride.pickup_latitude.toString())
      const pickupLng = parseFloat(ride.pickup_longitude.toString())
      const destLat = parseFloat(ride.destination_latitude.toString())
      const destLng = parseFloat(ride.destination_longitude.toString())

      console.log('🗺️ Fetching actual road distance from Google Maps...')

      // Import getRouteInfo from maps utils
      const { getRouteInfo } = await import('../utils/maps')

      let actualDistanceKm = 0
      let actualDurationMinutes = 0

      try {
        const routeInfo = await getRouteInfo(
          { latitude: pickupLat, longitude: pickupLng },
          { latitude: destLat, longitude: destLng }
        )

        if (routeInfo) {
          actualDistanceKm = routeInfo.distanceValue
          actualDurationMinutes = Math.round(routeInfo.durationValue)

          console.log('✅ Google Maps route info:', {
            distance: routeInfo.distance,
            duration: routeInfo.duration,
            distanceKm: actualDistanceKm.toFixed(2),
            durationMinutes: actualDurationMinutes
          })
        } else {
          throw new Error('Failed to get route info from Google Maps')
        }
      } catch (error) {
        console.warn('⚠️ Google Maps API failed, falling back to time-based calculation:', error)

        const rideStartTime = ride.created_at ? new Date(ride.created_at).getTime() : Date.now()
        const currentTime = Date.now()
        actualDurationMinutes = Math.round((currentTime - rideStartTime) / (1000 * 60))

        const R = 6371
        const dLat = (destLat - pickupLat) * Math.PI / 180
        const dLon = (destLng - pickupLng) * Math.PI / 180
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(pickupLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        actualDistanceKm = R * c

        console.log('⚠️ Using fallback calculation:', {
          actualDistanceKm: actualDistanceKm.toFixed(2),
          actualDurationMinutes
        })
      }

      console.log('🚨 Trip metrics (Road distance from Google Maps):', {
        actualDistanceKm: actualDistanceKm.toFixed(2),
        actualDurationMinutes,
        pickupLat,
        pickupLng,
        dropLat: destLat,
        dropLng: destLng,
        method: 'Google Maps Distance Matrix API'
      })

      // Calculate fare using FareCalculationService
      console.log('🚨 About to call FareCalculationService.calculateAndStoreTripFare...')
      const fareResult = await FareCalculationService.calculateAndStoreTripFare(
        rideId,
        actualDistanceKm,
        actualDurationMinutes,
        parseFloat(ride.pickup_latitude.toString()),
        parseFloat(ride.pickup_longitude.toString()),
        parseFloat(ride.destination_latitude.toString()),
        parseFloat(ride.destination_longitude.toString())
      )

      console.log('🚨 FareCalculationService result:', fareResult)

      if (!fareResult.success) {
        console.error('❌ Fare calculation failed:', fareResult.error)
        setError('Failed to calculate fare: ' + fareResult.error)
        return { success: false }
      }

      if (!fareResult.fareBreakdown) {
        console.error('❌ No fare breakdown returned')
        setError('No fare breakdown available')
        return { success: false }
      }

      console.log('✅ Fare calculated successfully:', fareResult.fareBreakdown)

      // Update ride status to completed
      const { data: completedRide, error: updateError } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'completed',
          fare_amount: fareResult.fareBreakdown.total_fare,
          distance_km: actualDistanceKm,
          duration_minutes: actualDurationMinutes,
          payment_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .select()
        .single()

      if (updateError) {
        console.error('❌ Error updating ride to completed:', updateError)
        setError('Failed to complete ride')
        return { success: false }
      }

      console.log('✅ Ride marked as completed in database')

      // Update driver status back to online
      await updateDriverStatus('online')
      console.log('✅ Driver status updated to online')

      // Clear current ride
      setCurrentRide(null)
      console.log('✅ Current ride cleared from state')

      // Prepare completion data for modal - FIXED VERSION
      console.log('=== PREPARING COMPLETION DATA ===')
      console.log('Raw fareBreakdown from service:', JSON.stringify(fareResult.fareBreakdown, null, 2))

      const completionData = {
        distance: actualDistanceKm,
        duration: actualDurationMinutes,
        fareBreakdown: {
          booking_type: fareResult.fareBreakdown.booking_type,
          vehicle_type: fareResult.fareBreakdown.vehicle_type,
          base_fare: fareResult.fareBreakdown.base_fare,
          distance_fare: fareResult.fareBreakdown.distance_fare,
          time_fare: fareResult.fareBreakdown.time_fare,
          surge_charges: fareResult.fareBreakdown.surge_charges,
          deadhead_charges: fareResult.fareBreakdown.deadhead_charges,
          platform_fee: fareResult.fareBreakdown.platform_fee, // Direct assignment
          gst_on_charges: fareResult.fareBreakdown.gst_on_charges,
          gst_on_platform_fee: fareResult.fareBreakdown.gst_on_platform_fee,
          extra_km_charges: fareResult.fareBreakdown.extra_km_charges,
          driver_allowance: fareResult.fareBreakdown.driver_allowance,
          total_fare: fareResult.fareBreakdown.total_fare, // Direct assignment
          details: fareResult.fareBreakdown.details
        },
        pickup_address: ride.pickup_address,
        destination_address: ride.destination_address,
        booking_type: ride.booking_type,
        rental_hours: ride.rental_hours
      }

      console.log('=== COMPLETION DATA PREPARED ===')
      console.log('Completion data object:', JSON.stringify(completionData, null, 2))
      console.log('Platform fee in completion data:', completionData.fareBreakdown.platform_fee)
      console.log('Total fare in completion data:', completionData.fareBreakdown.total_fare)
      console.log('=== ABOUT TO RETURN COMPLETION DATA ===')

      return { success: true, completionData }

    } catch (error) {
      console.error('❌ Exception completing ride:', error)
      setError('Failed to complete ride: ' + error.message)
      return { success: false }
    }
  }

  const cancelRide = async (rideId: string, reason: string): Promise<void> => {
    if (!driver) return

    try {
      console.log('=== CANCELLING RIDE ===')
      console.log('Ride ID:', rideId)
      console.log('Reason:', reason)

      const { error } = await supabaseAdmin
        .from('rides')
        .update({
          status: 'cancelled',
          cancelled_by: driver.user_id,
          cancellation_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .eq('driver_id', driver.id)

      if (error) {
        console.error('Error cancelling ride:', error)
        setError('Failed to cancel ride')
        return
      }

      // Update driver status back to online
      await updateDriverStatus('online')
      
      // Clear current ride
      setCurrentRide(null)
      
      console.log('✅ Ride cancelled successfully')
    } catch (error) {
      console.error('Exception cancelling ride:', error)
      setError('Failed to cancel ride')
    }
  }

  const refreshRides = async (): Promise<void> => {
    console.log('🔄 Manual refresh rides called')
    await loadRides()
  }

  const clearError = () => {
    setError(null)
  }

  const value = {
    currentRide,
    pendingRides,
    loading,
    error,
    acceptRide,
    declineRide,
    markDriverArrived,
    generatePickupOTP,
    verifyPickupOTP,
    startRide,
    generateDropOTP,
    completeRide,
    cancelRide,
    refreshRides,
    clearError,
  }

  return (
    <RideContext.Provider value={value}>
      {children}
    </RideContext.Provider>
  )
}