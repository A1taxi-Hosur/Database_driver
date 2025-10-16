import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

class NotificationSoundService {
  private sound: Audio.Sound | null = null;
  private isInitialized: boolean = false;

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });
      }
      this.isInitialized = true;
      console.log('✅ Notification sound service initialized');
    } catch (error) {
      console.error('❌ Error initializing notification sound service:', error);
    }
  }

  async playNotificationSound() {
    try {
      await this.initialize();

      if (Platform.OS === 'web') {
        this.playWebNotificationSound();
        return;
      }

      if (this.sound) {
        await this.sound.unloadAsync();
        this.sound = null;
      }

      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/sounds/notification.mp3'),
          { shouldPlay: true, volume: 1.0 },
          this.onPlaybackStatusUpdate
        );

        this.sound = sound;
        await sound.playAsync();

        console.log('🔊 Playing notification sound');
      } catch (soundError) {
        console.log('⚠️ Could not load notification.mp3, using fallback sound');
        this.playFallbackSound();
      }
    } catch (error) {
      console.error('❌ Error playing notification sound:', error);
      this.playFallbackSound();
    }
  }

  private playWebNotificationSound() {
    try {
      const audio = new window.Audio('/assets/sounds/notification.mp3');
      audio.volume = 1.0;
      audio.play().catch((error) => {
        console.error('❌ Error playing web notification sound:', error);
      });
      console.log('🔊 Playing web notification sound');
    } catch (error) {
      console.error('❌ Error creating web audio:', error);
    }
  }

  private playFallbackSound() {
    if (Platform.OS === 'web') {
      try {
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Create a pleasant notification sound with two tones
        const playTone = (frequency: number, startTime: number, duration: number) => {
          const oscillator = context.createOscillator();
          const gainNode = context.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(context.destination);

          oscillator.frequency.value = frequency;
          oscillator.type = 'sine';

          gainNode.gain.setValueAtTime(0.3, startTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

          oscillator.start(startTime);
          oscillator.stop(startTime + duration);
        };

        // Play two tones for a pleasant notification
        playTone(800, context.currentTime, 0.15);
        playTone(1000, context.currentTime + 0.2, 0.15);

        console.log('🔊 Playing fallback notification sound');
      } catch (error) {
        console.error('❌ Error playing fallback sound:', error);
      }
    } else {
      // For native platforms, just log - vibration will provide feedback
      console.log('⚠️ Fallback sound not available on native platform - using vibration only');
    }
  }

  async triggerVibration() {
    if (Platform.OS === 'web') {
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
        console.log('📳 Triggering web vibration');
      }
      return;
    }

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 200);

      setTimeout(async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 400);

      console.log('📳 Triggering vibration pattern');
    } catch (error) {
      console.error('❌ Error triggering vibration:', error);
    }
  }

  async playRideRequestNotification() {
    console.log('🚨 Playing ride request notification');

    await Promise.all([
      this.playNotificationSound(),
      this.triggerVibration(),
    ]);
  }

  private onPlaybackStatusUpdate = (status: any) => {
    if (status.didJustFinish) {
      console.log('✅ Notification sound finished playing');
    }
    if (status.error) {
      console.error('❌ Playback error:', status.error);
    }
  };

  async cleanup() {
    try {
      if (this.sound) {
        await this.sound.unloadAsync();
        this.sound = null;
      }
      console.log('✅ Notification sound service cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up notification sound service:', error);
    }
  }
}

export const notificationSoundService = new NotificationSoundService();
