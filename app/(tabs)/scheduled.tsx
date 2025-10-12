import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar,
  MapPin,
  Clock,
  IndianRupee,
  User,
  Navigation,
  Phone,
  CheckCircle,
  XCircle,
  AlertCircle,
  Car
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabaseAdmin } from '../../utils/supabase';
import { openGoogleMapsNavigation } from '../../utils/maps';
import OTPModal from '../../components/OTPModal';
import TripCompletionModal from '../../components/TripCompletionModal';

type ScheduledBooking = {
  id: string;
  customer_id: string;
  booking_type: 'outstation' | 'rental' | 'airport';
  vehicle_type: string;
  pickup_address: string;
  destination_address: string;
  pickup_landmark?: string;
  destination_landmark?: string;
  pickup_latitude: number;
  pickup_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  scheduled_time: string | null;
  rental_hours?: number;
  special_instructions?: string;
  estimated_fare?: number;
  status: 'pending' | 'assigned' | 'confirmed' | 'driver_arrived' | 'in_progress' | 'cancelled' | 'completed';
  assigned_driver_id?: string;
  pickup_otp?: string;
  drop_otp?: string;
  created_at: string;
  updated_at: string;
  customer?: {
    full_name: string;
    phone_number: string;
    email: string;
  };
};

export default function ScheduledScreen() {
  const { driver, updateDriverStatus } = useAuth();
  const [scheduledBookings, setScheduledBookings] = useState<ScheduledBooking[]>([]);
  const [currentBooking, setCurrentBooking] = useState<ScheduledBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [otpModalType, setOTPModalType] = useState<'pickup' | 'drop' | 'verify-pickup'>('pickup');
  const [currentOTP, setCurrentOTP] = useState('');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionData, setCompletionData] = useState(null);

  useEffect(() => {
    if (driver) {
      loadScheduledBookings();
    }
  }, [driver]);

  const loadScheduledBookings = async () => {
    if (!driver?.id) return;

    try {
      console.log('=== LOADING SCHEDULED BOOKINGS ===');
      console.log('Driver ID:', driver.id);

      // Get admin-assigned rides for this driver
      const { data: assignedRides, error: assignedError } = await supabaseAdmin
        .from('rides')
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            full_name,
            phone_number,
            email
          )
        `)
        .eq('driver_id', driver.id)
        .eq('assigned_by_admin', true)
        .in('booking_type', ['rental', 'outstation', 'airport'])
        .in('status', ['accepted', 'driver_arrived', 'in_progress'])
        .order('scheduled_time', { ascending: true });

      if (assignedError) {
        console.error('Error loading assigned rides:', assignedError);
        setCurrentBooking(null);
      } else {
        const activeBooking = assignedRides && assignedRides.length > 0 ? assignedRides[0] : null;
        setCurrentBooking(activeBooking);
        console.log('Current booking:', activeBooking?.id);
      }

      // Get available admin rides (assigned by admin to this driver but not yet accepted)
      const { data: availableRides, error: availableError } = await supabaseAdmin
        .from('rides')
        .select(`
          *,
          customer:users!rides_customer_id_fkey(
            full_name,
            phone_number,
            email
          )
        `)
        .eq('driver_id', driver.id)
        .eq('assigned_by_admin', true)
        .in('booking_type', ['rental', 'outstation', 'airport'])
        .eq('status', 'requested')
        .order('scheduled_time', { ascending: true })
        .limit(10);

      if (availableError) {
        console.error('Error loading available rides:', availableError);
        setScheduledBookings([]);
      } else {
        setScheduledBookings(availableBookings || []);
        console.log('Available bookings:', availableBookings?.length || 0);
      }

    } catch (error) {
      console.error('Exception loading scheduled bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadScheduledBookings();
    setRefreshing(false);
  };

  const handleAcceptBooking = async (bookingId: string) => {
    if (!driver?.id) return;

    try {
      const { data: updatedBooking, error } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          assigned_driver_id: driver.id,
          status: 'assigned',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .eq('status', 'pending')
        .select(`
          *,
          customer:users!scheduled_bookings_customer_id_fkey(
            full_name,
            phone_number,
            email
          )
        `)
        .single();

      if (error) {
        Alert.alert('Error', 'Failed to accept booking');
        return;
      }

      setCurrentBooking(updatedBooking);
      setScheduledBookings(prev => prev.filter(b => b.id !== bookingId));
      await updateDriverStatus('busy');
      Alert.alert('Success', 'Booking accepted successfully!');

    } catch (error) {
      console.error('Error accepting booking:', error);
      Alert.alert('Error', 'Failed to accept booking');
    }
  };

  const handleDriverArrived = async () => {
    if (!currentBooking) return;

    try {
      const { data: updatedBooking, error } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          status: 'driver_arrived',
          updated_at: new Date().toISOString()
        })
        .eq('id', currentBooking.id)
        .select(`
          *,
          customer:users!scheduled_bookings_customer_id_fkey(
            full_name,
            phone_number,
            email
          )
        `)
        .single();

      if (error) {
        Alert.alert('Error', 'Failed to mark as arrived');
        return;
      }

      setCurrentBooking(updatedBooking);
    } catch (error) {
      console.error('Error marking driver arrived:', error);
      Alert.alert('Error', 'Failed to mark as arrived');
    }
  };

  const handleGeneratePickupOTP = async () => {
    if (!currentBooking) return;
    
    try {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      
      const { error } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          pickup_otp: otp,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentBooking.id);

      if (error) {
        Alert.alert('Error', 'Failed to generate OTP');
        return;
      }

      setCurrentOTP(otp);
      setOTPModalType('pickup');
      setShowOTPModal(true);
    } catch (error) {
      console.error('Error generating pickup OTP:', error);
      Alert.alert('Error', 'Failed to generate OTP');
    }
  };

  const handleVerifyPickupOTP = () => {
    setOTPModalType('verify-pickup');
    setShowOTPModal(true);
  };

  const handleOTPVerification = async (otp: string) => {
    if (!currentBooking) return;
    
    try {
      const { data: booking, error } = await supabaseAdmin
        .from('scheduled_bookings')
        .select('pickup_otp')
        .eq('id', currentBooking.id)
        .single();

      if (error || !booking) {
        Alert.alert('Error', 'Failed to verify OTP');
        return;
      }

      if (booking.pickup_otp !== otp) {
        Alert.alert('Error', 'Incorrect OTP. Please try again.');
        return;
      }

      // Start the trip
      await handleStartTrip();
      setShowOTPModal(false);
    } catch (error) {
      console.error('Error verifying pickup OTP:', error);
      Alert.alert('Error', 'Failed to verify OTP');
    }
  };

  const handleStartTrip = async () => {
    if (!currentBooking) return;

    try {
      const { data: updatedBooking, error } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', currentBooking.id)
        .select(`
          *,
          customer:users!scheduled_bookings_customer_id_fkey(
            full_name,
            phone_number,
            email
          )
        `)
        .single();

      if (error) {
        Alert.alert('Error', 'Failed to start trip');
        return;
      }

      setCurrentBooking(updatedBooking);
    } catch (error) {
      console.error('Error starting trip:', error);
      Alert.alert('Error', 'Failed to start trip');
    }
  };

  const handleCompleteTrip = async () => {
    if (!currentBooking) return;

    try {
      console.log('🚨 COMPLETING SCHEDULED TRIP');
      console.log('Booking ID:', currentBooking.id);
      console.log('Booking type:', currentBooking.booking_type);

      // Calculate actual distance and duration (using estimated values for now)
      const actualDistanceKm = 25; // Default distance for testing
      const actualDurationMinutes = 45; // Default duration for testing

      console.log('Trip metrics:', {
        actualDistanceKm,
        actualDurationMinutes,
        pickupLat: currentBooking.pickup_latitude,
        pickupLng: currentBooking.pickup_longitude,
        dropLat: currentBooking.destination_latitude,
        dropLng: currentBooking.destination_longitude
      });

      // Calculate fare based on booking type
      let fareBreakdown;
      
      if (currentBooking.booking_type === 'rental') {
        fareBreakdown = await calculateRentalFare(
          currentBooking.vehicle_type,
          actualDistanceKm,
          actualDurationMinutes,
          currentBooking.rental_hours || 4
        );
      } else if (currentBooking.booking_type === 'outstation') {
        fareBreakdown = await calculateOutstationFare(
          currentBooking.vehicle_type,
          actualDistanceKm,
          actualDurationMinutes,
          currentBooking.scheduled_time
        );
      } else if (currentBooking.booking_type === 'airport') {
        fareBreakdown = await calculateAirportFare(
          currentBooking.vehicle_type,
          currentBooking.pickup_latitude,
          currentBooking.pickup_longitude,
          currentBooking.destination_latitude,
          currentBooking.destination_longitude
        );
      } else {
        throw new Error('Invalid booking type');
      }

      console.log('✅ Fare calculated:', fareBreakdown.total_fare);

      // Update booking status to completed
      const { data: updatedBooking, error: updateError } = await supabaseAdmin
        .from('scheduled_bookings')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', currentBooking.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Error completing booking:', updateError);
        Alert.alert('Error', 'Failed to complete trip');
        return;
      }

      console.log('✅ Scheduled booking completed successfully');

      // Prepare completion data for modal
      const completionData = {
        distance: actualDistanceKm,
        duration: actualDurationMinutes,
        fareBreakdown: fareBreakdown,
        pickup_address: currentBooking.pickup_address,
        destination_address: currentBooking.destination_address,
        booking_type: currentBooking.booking_type,
        rental_hours: currentBooking.rental_hours
      };

      // Update driver status back to online
      await updateDriverStatus('online');
      
      // Clear current booking
      setCurrentBooking(null);
      
      // Show completion modal
      setCompletionData(completionData);
      setShowCompletionModal(true);

    } catch (error) {
      console.error('❌ Exception completing scheduled trip:', error);
      Alert.alert('Error', 'Failed to complete trip: ' + error.message);
    }
  };

  const handleCancelBooking = () => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this scheduled booking?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            if (currentBooking) {
              try {
                await supabaseAdmin
                  .from('scheduled_bookings')
                  .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', currentBooking.id);

                await updateDriverStatus('online');
                setCurrentBooking(null);
              } catch (error) {
                console.error('Error cancelling booking:', error);
                Alert.alert('Error', 'Failed to cancel booking');
              }
            }
          }
        }
      ]
    );
  };

  const handleDirectionsToPickup = async () => {
    if (!currentBooking) return;
    
    try {
      await openGoogleMapsNavigation(
        currentBooking.pickup_latitude,
        currentBooking.pickup_longitude,
        currentBooking.pickup_address
      );
    } catch (error) {
      console.error('Error opening directions to pickup:', error);
      Alert.alert('Error', 'Could not open directions');
    }
  };

  const handleDirectionsToDestination = async () => {
    if (!currentBooking) return;
    
    try {
      await openGoogleMapsNavigation(
        currentBooking.destination_latitude,
        currentBooking.destination_longitude,
        currentBooking.destination_address
      );
    } catch (error) {
      console.error('Error opening directions to destination:', error);
      Alert.alert('Error', 'Could not open directions');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned': return '#2563EB';
      case 'confirmed': return '#8B5CF6';
      case 'driver_arrived': return '#F59E0B';
      case 'in_progress': return '#10B981';
      default: return '#6B7280';
    }
  };

  const getBookingTypeColor = (type: string) => {
    switch (type) {
      case 'rental': return '#8B5CF6';
      case 'outstation': return '#F59E0B';
      case 'airport': return '#06B6D4';
      default: return '#10B981';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not scheduled';
    
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      time: date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading scheduled bookings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <Text style={styles.title}>Scheduled Rides</Text>

        {/* Current Booking */}
        {currentBooking && (
          <View style={styles.currentBookingCard}>
            <View style={styles.bookingHeader}>
              <Text style={styles.bookingTitle}>Current Booking</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(currentBooking.status) }]}>
                <Text style={styles.statusText}>{currentBooking.status.replace('_', ' ').toUpperCase()}</Text>
              </View>
            </View>

            {/* Booking Type and Schedule */}
            <View style={styles.bookingInfo}>
              <View style={[styles.typeBadge, { backgroundColor: getBookingTypeColor(currentBooking.booking_type) }]}>
                <Text style={styles.typeText}>{currentBooking.booking_type.toUpperCase()}</Text>
              </View>
              
              {currentBooking.scheduled_time && (
                <View style={styles.scheduleInfo}>
                  <Clock size={16} color="#64748B" />
                  <Text style={styles.scheduleText}>
                    {formatDate(currentBooking.scheduled_time).date} at {formatDate(currentBooking.scheduled_time).time}
                  </Text>
                </View>
              )}
            </View>

            {/* Customer Info */}
            <View style={styles.customerInfo}>
              <User size={20} color="#64748B" />
              <Text style={styles.customerName}>
                {currentBooking.customer?.full_name || 'Customer'}
              </Text>
              <TouchableOpacity style={styles.phoneButton}>
                <Phone size={16} color="#2563EB" />
              </TouchableOpacity>
            </View>

            {/* Addresses */}
            <View style={styles.addressContainer}>
              <View style={styles.addressItem}>
                <View style={[styles.addressDot, { backgroundColor: '#10B981' }]} />
                <View style={styles.addressWithButton}>
                  <Text style={styles.addressText}>{currentBooking.pickup_address}</Text>
                  {(currentBooking.status === 'assigned' || currentBooking.status === 'confirmed' || currentBooking.status === 'driver_arrived') && (
                    <TouchableOpacity style={styles.inlineDirectionButton} onPress={handleDirectionsToPickup}>
                      <Navigation size={16} color="#2563EB" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.addressItem}>
                <View style={[styles.addressDot, { backgroundColor: '#EF4444' }]} />
                <View style={styles.addressWithButton}>
                  <Text style={styles.addressText}>{currentBooking.destination_address}</Text>
                  {currentBooking.status === 'in_progress' && (
                    <TouchableOpacity style={styles.inlineDirectionButton} onPress={handleDirectionsToDestination}>
                      <Navigation size={16} color="#2563EB" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* Booking Details */}
            <View style={styles.bookingDetails}>
              <View style={styles.detailItem}>
                <IndianRupee size={16} color="#10B981" />
                <Text style={styles.detailText}>₹{currentBooking.estimated_fare || 'TBD'}</Text>
              </View>
              
              {currentBooking.rental_hours && (
                <View style={styles.detailItem}>
                  <Clock size={16} color="#F59E0B" />
                  <Text style={styles.detailText}>{currentBooking.rental_hours}hrs</Text>
                </View>
              )}
            </View>

            {/* Special Instructions */}
            {currentBooking.special_instructions && (
              <View style={styles.instructionsContainer}>
                <Text style={styles.instructionsLabel}>Special Instructions:</Text>
                <Text style={styles.instructionsText}>{currentBooking.special_instructions}</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              {currentBooking.status === 'assigned' && (
                <>
                  <TouchableOpacity style={styles.arrivedButton} onPress={handleDriverArrived}>
                    <Navigation size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Mark as Arrived</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelButton} onPress={handleCancelBooking}>
                    <XCircle size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}

              {currentBooking.status === 'driver_arrived' && (
                <>
                  <TouchableOpacity style={styles.otpButton} onPress={handleGeneratePickupOTP}>
                    <AlertCircle size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Send OTP to Customer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.verifyButton} onPress={handleVerifyPickupOTP}>
                    <CheckCircle size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Enter Customer OTP</Text>
                  </TouchableOpacity>
                </>
              )}

              {currentBooking.status === 'in_progress' && (
                <TouchableOpacity 
                  style={styles.completeButton}
                  onPress={handleCompleteTrip}
                >
                  <CheckCircle size={20} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Complete Trip</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Available Bookings */}
        {!currentBooking && scheduledBookings.length > 0 && (
          <View style={styles.availableBookingsSection}>
            <Text style={styles.sectionTitle}>Available Bookings</Text>
            
            {scheduledBookings.map((booking) => {
              const scheduleInfo = formatDate(booking.scheduled_time);
              return (
                <View key={booking.id} style={styles.bookingCard}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.typeBadge, { backgroundColor: getBookingTypeColor(booking.booking_type) }]}>
                      <Text style={styles.typeText}>{booking.booking_type.toUpperCase()}</Text>
                    </View>
                    
                    <View style={styles.scheduleInfo}>
                      <Clock size={14} color="#64748B" />
                      <Text style={styles.scheduleText}>
                        {scheduleInfo.date} at {scheduleInfo.time}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.customerRow}>
                    <User size={16} color="#64748B" />
                    <Text style={styles.customerText}>
                      {booking.customer?.full_name || 'Anonymous'}
                    </Text>
                  </View>

                  <View style={styles.addressContainer}>
                    <View style={styles.addressItem}>
                      <View style={[styles.addressDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.addressText}>{booking.pickup_address}</Text>
                    </View>
                    <View style={styles.routeLine} />
                    <View style={styles.addressItem}>
                      <View style={[styles.addressDot, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.addressText}>{booking.destination_address}</Text>
                    </View>
                  </View>

                  <View style={styles.bookingStats}>
                    <View style={styles.statItem}>
                      <IndianRupee size={16} color="#10B981" />
                      <Text style={styles.statText}>₹{booking.estimated_fare || 'TBD'}</Text>
                    </View>
                    
                    {booking.rental_hours && (
                      <View style={styles.statItem}>
                        <Clock size={16} color="#F59E0B" />
                        <Text style={styles.statText}>{booking.rental_hours}hrs</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity 
                    style={styles.acceptButton}
                    onPress={() => handleAcceptBooking(booking.id)}
                  >
                    <CheckCircle size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Accept Booking</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Empty State */}
        {!currentBooking && scheduledBookings.length === 0 && (
          <View style={styles.emptyState}>
            <Calendar size={64} color="#CBD5E1" />
            <Text style={styles.emptyStateTitle}>No Scheduled Bookings</Text>
            <Text style={styles.emptyStateText}>
              Scheduled bookings will appear here when customers book rides in advance
            </Text>
          </View>
        )}
      </ScrollView>

      {/* OTP Modal */}
      <OTPModal
        visible={showOTPModal}
        type={otpModalType}
        currentOTP={currentOTP}
        onVerify={handleOTPVerification}
        onClose={() => setShowOTPModal(false)}
      />

      {/* Trip Completion Modal */}
      {completionData && (
        <TripCompletionModal
          visible={showCompletionModal}
          tripData={completionData}
          onClose={() => {
            setShowCompletionModal(false);
            setCompletionData(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

// Helper functions for fare calculation
async function calculateRentalFare(
  vehicleType: string,
  actualDistanceKm: number,
  actualDurationMinutes: number,
  selectedHours: number
) {
  const { data: rentalFares, error } = await supabaseAdmin
    .from('rental_fares')
    .select('*')
    .eq('vehicle_type', vehicleType)
    .eq('duration_hours', selectedHours)
    .eq('is_active', true)
    .order('is_popular', { ascending: false })
    .limit(1);

  if (error || !rentalFares || rentalFares.length === 0) {
    throw new Error('Rental fare configuration not found');
  }

  const rentalFare = rentalFares[0];
  const baseFare = rentalFare.base_fare;
  const kmIncluded = rentalFare.km_included;
  const extraKmRate = rentalFare.extra_km_rate;

  let extraKmCharges = 0;
  let withinAllowance = true;

  if (actualDistanceKm > kmIncluded) {
    const extraKm = actualDistanceKm - kmIncluded;
    extraKmCharges = extraKm * extraKmRate;
    withinAllowance = false;
  }

  const totalFare = baseFare + extraKmCharges;

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

async function calculateOutstationFare(
  vehicleType: string,
  actualDistanceKm: number,
  actualDurationMinutes: number,
  scheduledTime: string | null
) {
  const { data: outstationFares, error } = await supabaseAdmin
    .from('outstation_fares')
    .select('*')
    .eq('vehicle_type', vehicleType)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !outstationFares || outstationFares.length === 0) {
    throw new Error('Outstation fare configuration not found');
  }

  const outstationConfig = outstationFares[0];
  const baseFare = outstationConfig.base_fare;
  const perKmRate = outstationConfig.per_km_rate;
  const driverAllowancePerDay = outstationConfig.driver_allowance_per_day;
  const dailyKmLimit = outstationConfig.daily_km_limit;

  // Calculate number of days
  const startTime = scheduledTime ? new Date(scheduledTime) : new Date();
  const endTime = new Date();
  const durationHours = Math.abs(endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  const numberOfDays = Math.max(1, Math.ceil(durationHours / 24));

  const driverAllowance = numberOfDays * driverAllowancePerDay;
  const totalKmAllowance = numberOfDays * dailyKmLimit;

  let distanceFare = 0;
  let extraKmCharges = 0;
  let withinAllowance = true;

  if (actualDistanceKm <= totalKmAllowance) {
    distanceFare = 0;
    extraKmCharges = 0;
    withinAllowance = true;
  } else {
    distanceFare = actualDistanceKm * perKmRate;
    extraKmCharges = (actualDistanceKm - totalKmAllowance) * perKmRate;
    withinAllowance = false;
  }

  const totalFare = baseFare + distanceFare + driverAllowance;

  return {
    booking_type: 'outstation',
    vehicle_type: vehicleType,
    base_fare: baseFare,
    distance_fare: distanceFare,
    time_fare: 0,
    surge_charges: 0,
    deadhead_charges: 0,
    platform_fee: 0,
    gst_on_charges: 0,
    gst_on_platform_fee: 0,
    extra_km_charges: extraKmCharges,
    driver_allowance: driverAllowance,
    total_fare: totalFare,
    details: {
      actual_distance_km: actualDistanceKm,
      actual_duration_minutes: actualDurationMinutes,
      per_km_rate: perKmRate,
      days_calculated: numberOfDays,
      daily_km_limit: dailyKmLimit,
      within_allowance: withinAllowance
    }
  };
}

async function calculateAirportFare(
  vehicleType: string,
  pickupLat: number,
  pickupLng: number,
  dropLat: number,
  dropLng: number
) {
  const { data: airportFares, error } = await supabaseAdmin
    .from('airport_fares')
    .select('*')
    .eq('vehicle_type', vehicleType)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !airportFares || airportFares.length === 0) {
    throw new Error('Airport fare configuration not found');
  }

  const airportConfig = airportFares[0];
  
  // Determine direction based on coordinates
  const cityCenter = { lat: 12.7401984, lng: 77.824 };
  
  const pickupToCenter = calculateDistance(pickupLat, pickupLng, cityCenter.lat, cityCenter.lng);
  const dropToCenter = calculateDistance(dropLat, dropLng, cityCenter.lat, cityCenter.lng);
  
  const isHosurToAirport = pickupToCenter < dropToCenter;
  const fare = isHosurToAirport ? airportConfig.hosur_to_airport_fare : airportConfig.airport_to_hosur_fare;

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
      per_km_rate: 0
    }
  };
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  loadingText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 24,
  },
  currentBookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  bookingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  bookingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  typeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  scheduleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleText: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 4,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginLeft: 8,
    flex: 1,
  },
  phoneButton: {
    width: 32,
    height: 32,
    backgroundColor: '#EBF4FF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressContainer: {
    marginBottom: 16,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  addressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
    marginTop: 6,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
  },
  addressWithButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineDirectionButton: {
    width: 32,
    height: 32,
    backgroundColor: '#EBF4FF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: '#E2E8F0',
    marginLeft: 3,
    marginBottom: 8,
  },
  bookingDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    marginLeft: 4,
  },
  instructionsContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  instructionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 4,
  },
  instructionsText: {
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 18,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  arrivedButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpButton: {
    flex: 1,
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  availableBookingsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerText: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
  },
  bookingStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    marginLeft: 4,
  },
  acceptButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
});