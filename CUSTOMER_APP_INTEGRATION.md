# Customer App - Trip Completion Integration Guide

This guide explains how to integrate synchronized trip completion sheets in a customer app. The trip completion data is stored in the `trip_completions` table and is accessible to customers through Row Level Security policies.

## Overview

When a driver completes a trip, the system:
1. Calculates the fare using `FareCalculationService`
2. Stores complete trip details in `trip_completions` table including:
   - All fare breakdown components (base fare, distance charges, GST, etc.)
   - Driver information (name, phone, rating)
   - Vehicle details (make, model, color, license plate)
   - Trip metrics (distance, duration, addresses)
3. Updates the ride status to 'completed'

The customer app can then:
1. Listen for ride status changes via Supabase real-time subscriptions
2. Fetch the trip completion data from the database
3. Display the identical fare breakdown in `CustomerTripCompletionModal`
4. Allow customers to rate the driver and provide feedback

## Database Schema

The `trip_completions` table includes all necessary fields:

```typescript
interface TripCompletion {
  id: string
  ride_id: string
  driver_id: string
  customer_id: string
  booking_type: 'regular' | 'rental' | 'outstation' | 'airport'
  vehicle_type: string
  trip_type: 'one_way' | 'round_trip' | null

  // Addresses
  pickup_address: string
  destination_address: string

  // Trip metrics
  actual_distance_km: number
  actual_duration_minutes: number

  // Fare breakdown
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
  fare_details: any // JSON with additional calculation details

  // Driver & Vehicle info
  driver_name: string | null
  driver_phone: string | null
  driver_rating: number | null
  vehicle_id: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_color: string | null
  vehicle_license_plate: string | null

  // Metadata
  rental_hours: number | null
  scheduled_time: string | null
  completed_at: string
  created_at: string
}
```

## Row Level Security

The database has RLS policies that allow:
- Customers to view their own trip completions: `customer_id = auth.uid()`
- Drivers to view their own trip completions: `driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid())`
- Trip completions are immutable (cannot be updated or deleted)

## Implementation Steps

### 1. Real-Time Subscription for Customer Rides

Set up a Supabase real-time subscription to listen for ride status changes:

```typescript
import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'

function useCustomerRideUpdates(customerId: string) {
  const [completedRide, setCompletedRide] = useState<any>(null)

  useEffect(() => {
    // Subscribe to ride changes for this customer
    const subscription = supabase
      .channel('customer-rides')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rides',
          filter: `customer_id=eq.${customerId}`
        },
        async (payload) => {
          console.log('Ride update received:', payload)

          // Check if ride status changed to completed
          if (payload.new.status === 'completed') {
            console.log('Trip completed! Fetching completion data...')

            // Fetch trip completion data
            const tripCompletion = await fetchTripCompletion(payload.new.id)
            if (tripCompletion) {
              setCompletedRide(tripCompletion)
            }
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [customerId])

  return { completedRide, clearCompletedRide: () => setCompletedRide(null) }
}
```

### 2. Fetch Trip Completion Data

Function to fetch trip completion from database:

```typescript
import { TripCompletionService } from '../services/TripCompletionService'

async function fetchTripCompletion(rideId: string) {
  try {
    console.log('Fetching trip completion for ride:', rideId)

    const tripCompletion = await TripCompletionService.getTripCompletionByRideId(rideId)

    if (!tripCompletion) {
      console.error('Trip completion not found')
      return null
    }

    console.log('Trip completion fetched:', tripCompletion)

    // Format data for CustomerTripCompletionModal
    return {
      distance: tripCompletion.actual_distance_km,
      duration: tripCompletion.actual_duration_minutes,
      fareBreakdown: {
        booking_type: tripCompletion.booking_type,
        vehicle_type: tripCompletion.vehicle_type,
        base_fare: tripCompletion.base_fare,
        distance_fare: tripCompletion.distance_fare,
        time_fare: tripCompletion.time_fare,
        surge_charges: tripCompletion.surge_charges,
        deadhead_charges: tripCompletion.deadhead_charges,
        platform_fee: tripCompletion.platform_fee,
        gst_on_charges: tripCompletion.gst_on_charges,
        gst_on_platform_fee: tripCompletion.gst_on_platform_fee,
        extra_km_charges: tripCompletion.extra_km_charges,
        driver_allowance: tripCompletion.driver_allowance,
        total_fare: tripCompletion.total_fare,
        details: tripCompletion.fare_details
      },
      pickup_address: tripCompletion.pickup_address,
      destination_address: tripCompletion.destination_address,
      booking_type: tripCompletion.booking_type,
      rental_hours: tripCompletion.rental_hours,
      driver_name: tripCompletion.driver_name,
      driver_phone: tripCompletion.driver_phone,
      driver_rating: tripCompletion.driver_rating,
      vehicle_make: tripCompletion.vehicle_make,
      vehicle_model: tripCompletion.vehicle_model,
      vehicle_color: tripCompletion.vehicle_color,
      vehicle_license_plate: tripCompletion.vehicle_license_plate,
      ride_id: tripCompletion.ride_id
    }
  } catch (error) {
    console.error('Error fetching trip completion:', error)
    return null
  }
}
```

### 3. Display Trip Completion Modal

Use the `CustomerTripCompletionModal` component in your customer app:

```typescript
import React, { useState } from 'react'
import { View } from 'react-native'
import CustomerTripCompletionModal from '../components/CustomerTripCompletionModal'
import { TripCompletionService } from '../services/TripCompletionService'
import { useAuth } from '../contexts/AuthContext'

export default function CustomerRideScreen() {
  const { user } = useAuth()
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [tripCompletionData, setTripCompletionData] = useState<any>(null)

  // Use the real-time subscription hook
  const { completedRide, clearCompletedRide } = useCustomerRideUpdates(user?.id)

  // Show modal when trip is completed
  useEffect(() => {
    if (completedRide) {
      setTripCompletionData(completedRide)
      setShowCompletionModal(true)
    }
  }, [completedRide])

  // Handle rating submission
  const handleRatingSubmit = async (rideId: string, rating: number, feedback: string) => {
    if (!user) return

    const success = await TripCompletionService.submitRatingAndFeedback(
      rideId,
      user.id,
      rating,
      feedback
    )

    if (success) {
      console.log('Rating submitted successfully')
    } else {
      throw new Error('Failed to submit rating')
    }
  }

  return (
    <View>
      {/* Your ride screen content */}

      {/* Trip Completion Modal */}
      {tripCompletionData && (
        <CustomerTripCompletionModal
          visible={showCompletionModal}
          tripData={tripCompletionData}
          onClose={() => {
            setShowCompletionModal(false)
            clearCompletedRide()
          }}
          onRatingSubmit={handleRatingSubmit}
        />
      )}
    </View>
  )
}
```

### 4. View Trip History

Display past trip completions in ride history:

```typescript
import React, { useEffect, useState } from 'react'
import { FlatList, TouchableOpacity, Text, View } from 'react-native'
import { TripCompletionService } from '../services/TripCompletionService'
import CustomerTripCompletionModal from '../components/CustomerTripCompletionModal'

export default function RideHistoryScreen() {
  const { user } = useAuth()
  const [tripHistory, setTripHistory] = useState<any[]>([])
  const [selectedTrip, setSelectedTrip] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    loadTripHistory()
  }, [])

  const loadTripHistory = async () => {
    if (!user) return

    const completions = await TripCompletionService.getCustomerTripCompletions(user.id)
    setTripHistory(completions)
  }

  const handleTripPress = (trip: any) => {
    // Format trip data for modal
    const formattedTrip = {
      distance: trip.actual_distance_km,
      duration: trip.actual_duration_minutes,
      fareBreakdown: {
        booking_type: trip.booking_type,
        vehicle_type: trip.vehicle_type,
        base_fare: trip.base_fare,
        distance_fare: trip.distance_fare,
        time_fare: trip.time_fare,
        surge_charges: trip.surge_charges,
        deadhead_charges: trip.deadhead_charges,
        platform_fee: trip.platform_fee,
        gst_on_charges: trip.gst_on_charges,
        gst_on_platform_fee: trip.gst_on_platform_fee,
        extra_km_charges: trip.extra_km_charges,
        driver_allowance: trip.driver_allowance,
        total_fare: trip.total_fare,
        details: trip.fare_details
      },
      pickup_address: trip.pickup_address,
      destination_address: trip.destination_address,
      booking_type: trip.booking_type,
      rental_hours: trip.rental_hours,
      driver_name: trip.driver_name,
      driver_phone: trip.driver_phone,
      driver_rating: trip.driver_rating,
      vehicle_make: trip.vehicle_make,
      vehicle_model: trip.vehicle_model,
      vehicle_color: trip.vehicle_color,
      vehicle_license_plate: trip.vehicle_license_plate,
      ride_id: trip.ride_id
    }

    setSelectedTrip(formattedTrip)
    setShowModal(true)
  }

  return (
    <View>
      <FlatList
        data={tripHistory}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => handleTripPress(item)}>
            <View>
              <Text>{item.pickup_address} → {item.destination_address}</Text>
              <Text>₹{item.total_fare}</Text>
              <Text>{new Date(item.completed_at).toLocaleDateString()}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {selectedTrip && (
        <CustomerTripCompletionModal
          visible={showModal}
          tripData={selectedTrip}
          onClose={() => setShowModal(false)}
          onRatingSubmit={async (rideId, rating, feedback) => {
            // Handle rating submission for historical trips
            if (user) {
              await TripCompletionService.submitRatingAndFeedback(
                rideId,
                user.id,
                rating,
                feedback
              )
            }
          }}
        />
      )}
    </View>
  )
}
```

## Key Features

### 1. Exact Fare Synchronization
- Driver and customer see identical fare breakdowns
- Single source of truth in `trip_completions` table
- No possibility of fare discrepancies

### 2. Complete Driver & Vehicle Information
- Driver name, phone, and rating at time of trip
- Vehicle details (make, model, color, license plate)
- Historical accuracy maintained

### 3. Customer Rating System
- 1-5 star rating with optional feedback
- Updates driver's aggregate rating automatically
- One rating per trip (immutable after submission)

### 4. Real-Time Updates
- Instant notification when trip completes
- Automatic modal display with fare breakdown
- Works even if customer app is in background

### 5. Trip History Access
- View all past trip completions
- Tap to see full fare breakdown
- Rate past trips if not yet rated

## Testing

### Test Scenarios

1. **Complete Trip Flow**
   - Driver completes trip in driver app
   - Verify trip_completions record created with all fields
   - Customer app receives real-time update
   - Modal displays with correct fare and driver info

2. **Fare Breakdown Accuracy**
   - Compare driver's completion sheet with customer's
   - Verify all fare components match exactly
   - Check GST calculations are identical

3. **Rating Submission**
   - Customer rates trip and provides feedback
   - Verify rating stored in rides table
   - Confirm driver's aggregate rating updated
   - Check rating cannot be modified after submission

4. **Historical Trips**
   - View past trip completions in history screen
   - Open trip details modal
   - Verify all information displays correctly

5. **Edge Cases**
   - Customer app closed when trip completes
   - Network issues during fare fetch
   - Multiple trips completing in quick succession

## Security Considerations

1. **Row Level Security**: Customers can only view their own trip completions
2. **Immutable Records**: Trip completions cannot be modified after creation
3. **Rating Validation**: Ratings must be 1-5 stars, submitted by correct customer
4. **Driver Rating Updates**: Only system can update driver's aggregate rating

## Performance Optimization

1. **Database Indexes**: Indexes on customer_id, ride_id, completed_at for fast queries
2. **Real-Time Subscriptions**: Filtered by customer_id to reduce unnecessary updates
3. **Caching**: Store recent trip completions locally to reduce database calls
4. **Pagination**: Load trip history in pages for customers with many trips

## Troubleshooting

### Customer Not Seeing Completed Trip

1. Check real-time subscription is active
2. Verify ride status is 'completed' in database
3. Confirm trip_completions record exists for ride_id
4. Check RLS policies allow customer access

### Fare Breakdown Mismatch

1. Verify driver app using latest fare calculation logic
2. Check all fare components stored in trip_completions
3. Ensure fare_details JSON contains calculation metadata
4. Compare fare_breakdown structure in both apps

### Rating Not Submitting

1. Verify customer_id matches ride's customer
2. Check ride status is 'completed'
3. Confirm rating value is between 1-5
4. Verify customer hasn't already rated this trip

## Summary

This implementation provides a robust, synchronized trip completion experience where:
- Customers see the exact same fare breakdown as drivers
- All trip details are preserved with driver and vehicle information
- Customers can rate their experience and provide feedback
- Historical trips remain accessible with full detail
- Real-time updates ensure instant notification of trip completion

The centralized `trip_completions` table serves as the single source of truth, eliminating any possibility of discrepancies between driver and customer views.
