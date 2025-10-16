# Ride Request Notification Sound Feature

## Overview
When a new ride request comes in, the driver app will play a notification sound and trigger vibration to alert the driver.

## How It Works

### 1. Sound Playback
- **Native (iOS/Android)**: Plays the MP3 file located at `assets/sounds/notification.mp3`
- **Web**: Attempts to play the MP3 file, falls back to generated beep sounds if unavailable
- **Fallback**: If the MP3 file is missing, a pleasant two-tone beep is generated programmatically

### 2. Vibration
- **Native**: Uses expo-haptics to create a notification vibration pattern
- **Web**: Uses the browser's Vibration API with pattern: [200ms, 100ms, 200ms, 100ms, 200ms]

### 3. Trigger Points
The notification sound and vibration are triggered in two scenarios:

1. **Real-time notification**: When a new ride_request notification is received via Supabase real-time
2. **Polling detection**: When the 2-second auto-refresh detects new pending rides

## Adding Your Own Notification Sound

1. Find or create a notification sound (MP3 format)
2. Replace the placeholder file at `assets/sounds/notification.mp3`
3. Recommended specifications:
   - Format: MP3
   - Duration: 1-3 seconds
   - Volume: Medium to high
   - Type: Alert/notification tone

### Free Sound Resources
- https://freesound.org/
- https://mixkit.co/free-sound-effects/notification/
- https://pixabay.com/sound-effects/search/notification/

## Implementation Details

### Service: NotificationSoundService
Location: `services/NotificationSoundService.ts`

Features:
- Singleton service for consistent audio management
- Platform-specific implementations (web vs native)
- Automatic fallback to generated sounds
- Proper cleanup on unmount
- Audio mode configuration for background playback

### Integration: RideContext
Location: `contexts/RideContext.tsx`

Changes:
- Imports NotificationSoundService
- Initializes service on mount
- Plays notification when new rides detected
- Cleans up service on unmount
- Tracks previous pending count to avoid duplicate notifications

## Dependencies

- `expo-av`: Audio playback (version ~14.0.0)
- `expo-haptics`: Vibration feedback (version ~13.0.0)

## Testing

To test the notification:
1. Ensure you have a driver logged in and online
2. Create a new ride request from a customer app
3. The driver app should play sound and vibrate
4. Check console logs for debugging information

## Console Log Messages

- `🔊 Playing notification sound` - Sound started successfully
- `📳 Triggering vibration pattern` - Vibration triggered
- `🚨 Playing ride request notification` - Full notification sequence started
- `⚠️ Could not load notification.mp3, using fallback sound` - MP3 file not found
- `✅ Notification sound service initialized` - Service ready
- `🔊 New ride request detected! Playing notification sound` - New ride detected via polling

## Troubleshooting

### Sound Not Playing
1. Check if `expo-av` is installed: `npm list expo-av`
2. Verify the MP3 file exists at `assets/sounds/notification.mp3`
3. On iOS, ensure "Plays in Silent Mode" is enabled (handled automatically)
4. Check browser console for web-specific errors

### Vibration Not Working
1. Verify `expo-haptics` is installed: `npm list expo-haptics`
2. On web, check if browser supports Vibration API
3. On native, ensure device supports haptic feedback

### Multiple Notifications
- The system tracks previous pending count to avoid duplicate sounds
- Each unique ride request will only trigger notification once
