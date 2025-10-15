import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { CircleCheck as CheckCircle, MapPin, Clock, X, Star, User, Car, Phone } from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface CustomerTripCompletionModalProps {
  visible: boolean;
  tripData: {
    distance: number;
    duration: number;
    fareBreakdown: {
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
        platform_fee_percent?: number;
        days_calculated?: number;
        daily_km_limit?: number;
        within_allowance?: boolean;
        package_name?: string;
      };
    };
    pickup_address: string;
    destination_address: string;
    booking_type: string;
    rental_hours?: number;
    driver_name?: string;
    driver_phone?: string;
    driver_rating?: number;
    vehicle_make?: string;
    vehicle_model?: string;
    vehicle_color?: string;
    vehicle_license_plate?: string;
    ride_id?: string;
  };
  onClose: () => void;
  onRatingSubmit?: (rideId: string, rating: number, feedback: string) => Promise<void>;
}

export default function CustomerTripCompletionModal({
  visible,
  tripData,
  onClose,
  onRatingSubmit,
}: CustomerTripCompletionModalProps) {
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [hasSubmittedRating, setHasSubmittedRating] = useState(false);

  const formatCurrency = (amount: number | undefined | null) => {
    if (amount == null || amount === undefined) {
      return `₹0.00`;
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) {
      return `₹0.00`;
    }

    return `₹${numericAmount.toFixed(2)}`;
  };

  const handleRatingSelect = (rating: number) => {
    if (!hasSubmittedRating) {
      setSelectedRating(rating);
    }
  };

  const handleSubmitRating = async () => {
    if (selectedRating === 0) {
      Alert.alert('Rating Required', 'Please select a rating before submitting.');
      return;
    }

    if (!tripData.ride_id) {
      Alert.alert('Error', 'Unable to submit rating. Ride information is missing.');
      return;
    }

    if (!onRatingSubmit) {
      Alert.alert('Error', 'Rating submission is not available.');
      return;
    }

    try {
      setIsSubmittingRating(true);
      await onRatingSubmit(tripData.ride_id, selectedRating, feedback);
      setHasSubmittedRating(true);
      Alert.alert('Success', 'Thank you for your feedback!');
    } catch (error) {
      console.error('Error submitting rating:', error);
      Alert.alert('Error', 'Failed to submit rating. Please try again.');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <CheckCircle size={32} color="#10B981" />
              <Text style={styles.title}>Trip Completed!</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Scrollable Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {/* Driver Information */}
            {tripData.driver_name && (
              <View style={styles.driverSection}>
                <Text style={styles.sectionTitle}>Driver Information</Text>
                <View style={styles.driverCard}>
                  <View style={styles.driverInfo}>
                    <User size={24} color="#2563EB" />
                    <View style={styles.driverDetails}>
                      <Text style={styles.driverName}>{tripData.driver_name}</Text>
                      {tripData.driver_phone && (
                        <View style={styles.driverPhoneRow}>
                          <Phone size={14} color="#64748B" />
                          <Text style={styles.driverPhone}>{tripData.driver_phone}</Text>
                        </View>
                      )}
                      {tripData.driver_rating && (
                        <View style={styles.driverRatingRow}>
                          <Star size={14} color="#F59E0B" fill="#F59E0B" />
                          <Text style={styles.driverRatingText}>{tripData.driver_rating.toFixed(1)}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Vehicle Info */}
                  {tripData.vehicle_make && (
                    <View style={styles.vehicleInfo}>
                      <Car size={20} color="#64748B" />
                      <View style={styles.vehicleDetails}>
                        <Text style={styles.vehicleText}>
                          {tripData.vehicle_color} {tripData.vehicle_make} {tripData.vehicle_model}
                        </Text>
                        {tripData.vehicle_license_plate && (
                          <Text style={styles.vehiclePlate}>{tripData.vehicle_license_plate}</Text>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Trip Summary */}
            <View style={styles.tripSummary}>
              <View style={styles.summaryRow}>
                <MapPin size={20} color="#64748B" />
                <Text style={styles.summaryLabel}>Distance:</Text>
                <Text style={styles.summaryValue}>
                  {(tripData.fareBreakdown.details?.actual_distance_km || tripData.distance).toFixed(2)} km
                  {tripData.booking_type === 'outstation' ? ' (GPS-tracked)' : ' (Road Distance)'}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Clock size={20} color="#64748B" />
                <Text style={styles.summaryLabel}>Duration:</Text>
                <Text style={styles.summaryValue}>
                  {tripData.fareBreakdown.details?.actual_duration_minutes || tripData.duration} minutes (Actual)
                </Text>
              </View>

              {tripData.booking_type === 'outstation' && tripData.fareBreakdown.details?.days_calculated && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Trip Duration:</Text>
                  <Text style={styles.summaryValue}>
                    {tripData.fareBreakdown.details.days_calculated} day{tripData.fareBreakdown.details.days_calculated > 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>

            {/* Route Details */}
            <View style={styles.routeSection}>
              <Text style={styles.sectionTitle}>Route Details</Text>
              <View style={styles.addressContainer}>
                <View style={styles.addressItem}>
                  <View style={[styles.addressDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.addressText}>{tripData.pickup_address}</Text>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.addressItem}>
                  <View style={[styles.addressDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.addressText}>{tripData.destination_address}</Text>
                </View>
              </View>
            </View>

            {/* Fare Breakdown */}
            <View style={styles.fareSection}>
              <Text style={styles.sectionTitle}>Fare Breakdown</Text>

              {tripData.booking_type === 'rental' ? (
                <>
                  <View style={styles.fareItem}>
                    <Text style={styles.fareLabel}>
                      {tripData.fareBreakdown.details?.package_name || 'Rental Package'}
                      {tripData.rental_hours && tripData.fareBreakdown.details?.base_km_included &&
                       ` (${tripData.rental_hours}hr, ${tripData.fareBreakdown.details?.base_km_included}km)`}
                    </Text>
                    <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.base_fare)}</Text>
                  </View>

                  {tripData.fareBreakdown.extra_km_charges > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>
                        Extra Distance Charges
                        {tripData.fareBreakdown.details?.extra_km &&
                         ` (${tripData.fareBreakdown.details?.extra_km.toFixed(1)}km × ₹${tripData.fareBreakdown.details?.per_km_rate}/km)`}
                      </Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.extra_km_charges)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.time_fare > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>
                        Extra Time Charges
                        {tripData.fareBreakdown.details?.per_minute_rate &&
                         ` (₹${tripData.fareBreakdown.details?.per_minute_rate}/min)`}
                      </Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.time_fare)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.platform_fee > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>Platform Fee</Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.platform_fee)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.gst_on_charges > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>GST on Charges (5%)</Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.gst_on_charges)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.gst_on_platform_fee > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>GST on Platform Fee (18%)</Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.gst_on_platform_fee)}</Text>
                    </View>
                  )}

                  <View style={styles.separator} />

                  <View style={styles.totalFareItem}>
                    <Text style={styles.totalFareLabel}>Total Fare</Text>
                    <Text style={styles.totalFareValue}>
                      {formatCurrency(tripData.fareBreakdown.total_fare)}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.fareItem}>
                    <Text style={styles.fareLabel}>
                      {tripData.booking_type === 'outstation' && tripData.fareBreakdown.details?.package_name
                        ? `${tripData.fareBreakdown.details.package_name} Fare`
                        : tripData.fareBreakdown.details?.package_name ||
                          `${((tripData.fareBreakdown.booking_type || 'regular') + '').charAt(0).toUpperCase() + ((tripData.fareBreakdown.booking_type || 'regular') + '').slice(1)} Base Fare`}
                      {tripData.fareBreakdown.details?.base_km_included &&
                       ` (${tripData.fareBreakdown.details?.base_km_included}km included)`}
                    </Text>
                    <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.base_fare)}</Text>
                  </View>

                  {tripData.fareBreakdown.distance_fare > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>
                        {tripData.booking_type === 'outstation' ? 'Per KM Charges' : 'Distance Charges'}
                      </Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.distance_fare)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.time_fare > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>Time Charges</Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.time_fare)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.deadhead_charges > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>Deadhead Charges</Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.deadhead_charges)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.surge_charges > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>
                        Surge Charges ({tripData.fareBreakdown.details?.surge_multiplier || 1}x)
                      </Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.surge_charges)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.platform_fee > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>Platform Fee</Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.platform_fee)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.gst_on_charges > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>GST on Charges (5%)</Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.gst_on_charges)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.gst_on_platform_fee > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>GST on Platform Fee (18%)</Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.gst_on_platform_fee)}</Text>
                    </View>
                  )}

                  {tripData.fareBreakdown.driver_allowance > 0 && (
                    <View style={styles.fareItem}>
                      <Text style={styles.fareLabel}>
                        Driver Allowance ({tripData.fareBreakdown.details?.days_calculated} days)
                      </Text>
                      <Text style={styles.fareValue}>{formatCurrency(tripData.fareBreakdown.driver_allowance)}</Text>
                    </View>
                  )}

                  <View style={styles.separator} />

                  <View style={styles.totalFareItem}>
                    <Text style={styles.totalFareLabel}>Total Fare</Text>
                    <Text style={styles.totalFareValue}>
                      {formatCurrency(tripData.fareBreakdown.total_fare)}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Rating Section */}
            {!hasSubmittedRating && (
              <View style={styles.ratingSection}>
                <Text style={styles.sectionTitle}>Rate Your Experience</Text>
                <Text style={styles.ratingSubtitle}>How was your trip?</Text>

                <View style={styles.starsContainer}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => handleRatingSelect(star)}
                      style={styles.starButton}
                    >
                      <Star
                        size={40}
                        color={star <= selectedRating ? '#F59E0B' : '#E5E7EB'}
                        fill={star <= selectedRating ? '#F59E0B' : 'transparent'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  style={styles.feedbackInput}
                  placeholder="Share your feedback (optional)"
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  value={feedback}
                  onChangeText={setFeedback}
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={[styles.submitRatingButton, selectedRating === 0 && styles.submitRatingButtonDisabled]}
                  onPress={handleSubmitRating}
                  disabled={isSubmittingRating || selectedRating === 0}
                >
                  <Text style={styles.submitRatingButtonText}>
                    {isSubmittingRating ? 'Submitting...' : 'Submit Rating'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {hasSubmittedRating && (
              <View style={styles.ratingSubmittedSection}>
                <CheckCircle size={48} color="#10B981" />
                <Text style={styles.ratingSubmittedText}>Thank you for your feedback!</Text>
              </View>
            )}
          </ScrollView>

          {/* Done Button */}
          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    maxHeight: '90%',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginLeft: 12,
  },
  closeButton: {
    padding: 8,
  },
  driverSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  driverCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  driverDetails: {
    marginLeft: 12,
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  driverPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  driverPhone: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 4,
  },
  driverRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRatingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 4,
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  vehicleDetails: {
    marginLeft: 12,
    flex: 1,
  },
  vehicleText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  vehiclePlate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  tripSummary: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#64748B',
    marginLeft: 12,
    flex: 1,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  routeSection: {
    marginBottom: 20,
  },
  addressContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    marginRight: 12,
  },
  addressText: {
    fontSize: 14,
    color: '#64748B',
    flex: 1,
    lineHeight: 20,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#E5E7EB',
    marginLeft: 5,
    marginVertical: 8,
  },
  fareSection: {
    marginBottom: 20,
  },
  fareItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  fareLabel: {
    fontSize: 14,
    color: '#64748B',
    flex: 1,
  },
  fareValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  totalFareItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  totalFareLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  totalFareValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
  },
  ratingSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  ratingSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  starButton: {
    padding: 8,
  },
  feedbackInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 100,
    marginBottom: 16,
  },
  submitRatingButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitRatingButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  submitRatingButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ratingSubmittedSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  ratingSubmittedText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10B981',
    marginTop: 16,
  },
  doneButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
