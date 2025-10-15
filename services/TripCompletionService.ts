import { supabaseAdmin } from '../utils/supabase'

export interface TripCompletion {
  id: string
  ride_id: string
  driver_id: string
  customer_id: string
  booking_type: 'regular' | 'rental' | 'outstation' | 'airport'
  vehicle_type: string
  trip_type: 'one_way' | 'round_trip' | null
  pickup_address: string
  destination_address: string
  actual_distance_km: number
  actual_duration_minutes: number
  base_fare: number
  distance_fare: number
  time_fare: number
  surge_charges: number
  deadhead_charges: number
  platform_fee: number
  gst_on_charges: number
  gst_on_platform_fee: number
  extra_km_charges: number
  driver_allowance: number
  total_fare: number
  fare_details: any
  rental_hours: number | null
  scheduled_time: string | null
  completed_at: string
  created_at: string
}

export class TripCompletionService {
  /**
   * Fetch trip completion by ride ID
   */
  static async getTripCompletionByRideId(rideId: string): Promise<TripCompletion | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('trip_completions')
        .select('*')
        .eq('ride_id', rideId)
        .maybeSingle()

      if (error) {
        console.error('Error fetching trip completion:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Exception fetching trip completion:', error)
      return null
    }
  }

  /**
   * Fetch all trip completions for a customer
   */
  static async getCustomerTripCompletions(customerId: string): Promise<TripCompletion[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('trip_completions')
        .select('*')
        .eq('customer_id', customerId)
        .order('completed_at', { ascending: false })

      if (error) {
        console.error('Error fetching customer trip completions:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Exception fetching customer trip completions:', error)
      return []
    }
  }

  /**
   * Fetch all trip completions for a driver
   */
  static async getDriverTripCompletions(driverId: string): Promise<TripCompletion[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('trip_completions')
        .select('*')
        .eq('driver_id', driverId)
        .order('completed_at', { ascending: false })

      if (error) {
        console.error('Error fetching driver trip completions:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Exception fetching driver trip completions:', error)
      return []
    }
  }

  /**
   * Fetch trip completions by booking type
   */
  static async getTripCompletionsByType(
    userId: string,
    userType: 'customer' | 'driver',
    bookingType: 'regular' | 'rental' | 'outstation' | 'airport'
  ): Promise<TripCompletion[]> {
    try {
      const column = userType === 'customer' ? 'customer_id' : 'driver_id'

      const { data, error } = await supabaseAdmin
        .from('trip_completions')
        .select('*')
        .eq(column, userId)
        .eq('booking_type', bookingType)
        .order('completed_at', { ascending: false })

      if (error) {
        console.error('Error fetching trip completions by type:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Exception fetching trip completions by type:', error)
      return []
    }
  }

  /**
   * Fetch trip completions within a date range
   */
  static async getTripCompletionsByDateRange(
    userId: string,
    userType: 'customer' | 'driver',
    startDate: string,
    endDate: string
  ): Promise<TripCompletion[]> {
    try {
      const column = userType === 'customer' ? 'customer_id' : 'driver_id'

      const { data, error } = await supabaseAdmin
        .from('trip_completions')
        .select('*')
        .eq(column, userId)
        .gte('completed_at', startDate)
        .lte('completed_at', endDate)
        .order('completed_at', { ascending: false })

      if (error) {
        console.error('Error fetching trip completions by date range:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Exception fetching trip completions by date range:', error)
      return []
    }
  }

  /**
   * Calculate total earnings for a driver
   */
  static async getDriverTotalEarnings(driverId: string): Promise<number> {
    try {
      const { data, error } = await supabaseAdmin
        .from('trip_completions')
        .select('total_fare')
        .eq('driver_id', driverId)

      if (error) {
        console.error('Error calculating driver earnings:', error)
        return 0
      }

      const totalEarnings = data?.reduce((sum, completion) => sum + completion.total_fare, 0) || 0
      return totalEarnings
    } catch (error) {
      console.error('Exception calculating driver earnings:', error)
      return 0
    }
  }

  /**
   * Calculate total spending for a customer
   */
  static async getCustomerTotalSpending(customerId: string): Promise<number> {
    try {
      const { data, error } = await supabaseAdmin
        .from('trip_completions')
        .select('total_fare')
        .eq('customer_id', customerId)

      if (error) {
        console.error('Error calculating customer spending:', error)
        return 0
      }

      const totalSpending = data?.reduce((sum, completion) => sum + completion.total_fare, 0) || 0
      return totalSpending
    } catch (error) {
      console.error('Exception calculating customer spending:', error)
      return 0
    }
  }

  /**
   * Submit customer rating and feedback for a completed trip
   */
  static async submitRatingAndFeedback(
    rideId: string,
    customerId: string,
    rating: number,
    feedback: string
  ): Promise<boolean> {
    try {
      console.log('=== SUBMITTING RATING AND FEEDBACK ===')
      console.log('Ride ID:', rideId)
      console.log('Customer ID:', customerId)
      console.log('Rating:', rating)
      console.log('Feedback length:', feedback.length)

      // Validate rating
      if (rating < 1 || rating > 5) {
        console.error('Invalid rating value:', rating)
        return false
      }

      // Update the ride with rating and feedback
      const { error: rideError } = await supabaseAdmin
        .from('rides')
        .update({
          rating: rating,
          feedback: feedback || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', rideId)
        .eq('customer_id', customerId)
        .eq('status', 'completed')

      if (rideError) {
        console.error('Error updating ride with rating:', rideError)
        return false
      }

      console.log('✅ Ride updated with rating and feedback')

      // Get driver_id from the trip completion
      const { data: tripCompletion, error: completionError } = await supabaseAdmin
        .from('trip_completions')
        .select('driver_id')
        .eq('ride_id', rideId)
        .maybeSingle()

      if (completionError || !tripCompletion) {
        console.error('Error fetching trip completion for driver update:', completionError)
        return true
      }

      // Update driver's aggregate rating
      await this.updateDriverRating(tripCompletion.driver_id)
      console.log('✅ Driver rating updated')

      return true
    } catch (error) {
      console.error('Exception submitting rating and feedback:', error)
      return false
    }
  }

  /**
   * Update driver's aggregate rating based on all completed rides
   */
  private static async updateDriverRating(driverId: string): Promise<void> {
    try {
      // Get all ratings for this driver
      const { data: rides, error: ridesError } = await supabaseAdmin
        .from('rides')
        .select('rating')
        .eq('driver_id', driverId)
        .eq('status', 'completed')
        .not('rating', 'is', null)

      if (ridesError) {
        console.error('Error fetching driver ratings:', ridesError)
        return
      }

      if (!rides || rides.length === 0) {
        console.log('No ratings found for driver:', driverId)
        return
      }

      // Calculate average rating
      const totalRating = rides.reduce((sum, ride) => sum + (ride.rating || 0), 0)
      const averageRating = totalRating / rides.length

      // Update driver's rating
      const { error: driverError } = await supabaseAdmin
        .from('drivers')
        .update({
          rating: averageRating,
          updated_at: new Date().toISOString()
        })
        .eq('id', driverId)

      if (driverError) {
        console.error('Error updating driver rating:', driverError)
        return
      }

      console.log(`✅ Driver ${driverId} rating updated to ${averageRating.toFixed(2)}`)
    } catch (error) {
      console.error('Exception updating driver rating:', error)
    }
  }

  /**
   * Check if customer has already rated a trip
   */
  static async hasCustomerRatedTrip(rideId: string, customerId: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .from('rides')
        .select('rating')
        .eq('id', rideId)
        .eq('customer_id', customerId)
        .maybeSingle()

      if (error) {
        console.error('Error checking if customer rated trip:', error)
        return false
      }

      return data?.rating !== null && data?.rating !== undefined
    } catch (error) {
      console.error('Exception checking if customer rated trip:', error)
      return false
    }
  }
}
