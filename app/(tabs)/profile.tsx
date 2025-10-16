import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Car, LogOut, Star, Shield, MapPin } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from '../../contexts/LocationContext';

export default function ProfileScreen() {
  const { signOut, driver, updateDriverStatus } = useAuth();
  const { currentAddress } = useLocation();

  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case 'online': return '#10B981';
      case 'busy': return '#F59E0B';
      case 'offline': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string | undefined) => {
    switch (status) {
      case 'online': return 'Online';
      case 'busy': return 'Busy';
      case 'offline': return 'Offline';
      default: return 'Offline';
    }
  };

  const handleSignOut = () => {
    console.log('=== SIGN OUT BUTTON CLICKED ===');
    
    if (Platform.OS === 'web') {
      // Use web-native confirm dialog
      console.log('Using web confirm dialog...');
      const confirmed = window.confirm('Are you sure you want to sign out?');
      console.log('User confirmed:', confirmed);
      
      if (confirmed) {
        performSignOut();
      } else {
        console.log('Sign out cancelled by user');
      }
    } else {
      // Use React Native Alert for mobile
      const { Alert } = require('react-native');
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Sign Out', 
            style: 'destructive', 
            onPress: performSignOut
          }
        ]
      );
    }
  };

  const performSignOut = async () => {
    try {
      console.log('=== SIGN OUT INITIATED ===');
      await signOut();
      console.log('✅ Sign out completed');
    } catch (error) {
      console.error('Sign out error:', error);
      
      if (Platform.OS === 'web') {
        window.alert('Failed to sign out. Please try again.');
      } else {
        const { Alert } = require('react-native');
        Alert.alert('Error', 'Failed to sign out. Please try again.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.profileInfo}>
            <View style={styles.avatarContainer}>
              <User size={32} color="#64748B" />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{driver?.user?.full_name || 'Driver Name'}</Text>
              <Text style={styles.userEmail}>{driver?.user?.email || driver?.user?.phone_number || 'No contact info'}</Text>
              <View style={styles.statusContainer}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(driver?.status) }]} />
                <Text style={styles.statusText}>{getStatusText(driver?.status)}</Text>
              </View>
            </View>
          </View>
          
          <View style={styles.ratingContainer}>
            <Star size={20} color="#F59E0B" />
            <Text style={styles.ratingText}>{driver?.rating || '5.0'}</Text>
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{driver?.total_rides || 0}</Text>
            <Text style={styles.statLabel}>Total Rides</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{driver?.rating || '5.0'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>100%</Text>
            <Text style={styles.statLabel}>Acceptance</Text>
          </View>
        </View>

        {/* Vehicle Info */}
        <View style={styles.vehicleCard}>
          <View style={styles.cardHeader}>
            <Car size={20} color="#2563EB" />
            <Text style={styles.cardTitle}>Vehicle Information</Text>
          </View>
          <View style={styles.vehicleInfo}>
            {driver?.vehicle ? (
              <>
                <Text style={styles.vehicleText}>
                  {driver.vehicle.make} {driver.vehicle.model} ({driver.vehicle.year})
                </Text>
                <Text style={styles.vehicleDetails}>
                  {driver.vehicle.registration_number} • {driver.vehicle.color} • {driver.vehicle.vehicle_type}
                </Text>
              </>
            ) : (
              <Text style={styles.vehicleText}>No vehicle assigned</Text>
            )}
          </View>
        </View>

        {/* Current Location */}
        <View style={styles.locationCard}>
          <View style={styles.cardHeader}>
            <MapPin size={20} color="#10B981" />
            <Text style={styles.cardTitle}>Current Location</Text>
          </View>
          <View style={styles.locationInfo}>
            <Text style={styles.locationText}>
              {currentAddress || 'Location not available'}
            </Text>
          </View>
        </View>

        {/* License Info */}
        <View style={styles.licenseCard}>
          <View style={styles.cardHeader}>
            <Shield size={20} color="#10B981" />
            <Text style={styles.cardTitle}>License Information</Text>
          </View>
          <View style={styles.licenseInfo}>
            <Text style={styles.licenseNumber}>
              License: {driver?.license_number || 'Not available'}
            </Text>
            <Text style={styles.licenseExpiry}>
              Expires: {driver?.license_expiry ? new Date(driver.license_expiry).toLocaleDateString('en-IN') : 'Not available'}
            </Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={20} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>A1 Taxi v1.0.0</Text>
          <Text style={styles.copyright}>© 2025 A1 Taxi. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    backgroundColor: '#F1F5F9',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginLeft: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  vehicleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  licenseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginLeft: 8,
  },
  vehicleInfo: {
    marginLeft: 28,
  },
  vehicleText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: 4,
  },
  vehicleDetails: {
    fontSize: 14,
    color: '#64748B',
  },
  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  locationInfo: {
    marginLeft: 28,
  },
  locationText: {
    fontSize: 14,
    color: '#1E293B',
  },
  licenseInfo: {
    marginLeft: 28,
  },
  licenseNumber: {
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 4,
  },
  licenseExpiry: {
    fontSize: 14,
    color: '#64748B',
  },
  signOutButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: 8,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  appVersion: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 4,
  },
  copyright: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
});