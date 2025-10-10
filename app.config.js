const IS_DEV = process.env.NODE_ENV === 'development';

export default {
  expo: {
    name: "A1 Taxi",
    slug: "taxi-driver-pro",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "taxidriver",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    
    // Disable telemetry and analytics to prevent network calls
    analytics: false,
    
    // Configure for offline development
    updates: {
      enabled: false,
      checkAutomatically: "ON_ERROR_RECOVERY",
      fallbackToCacheTimeout: 0
    },
    
    ios: {
      supportsTablet: true
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      }
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-font",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "A1 Taxi needs location access to find nearby ride requests, share your location with customers, and provide accurate pickup and drop-off services.",
          locationWhenInUsePermission: "A1 Taxi needs location access to find nearby ride requests, share your location with customers, and provide accurate pickup and drop-off services.",
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true
        }
      ],
      [
        "expo-task-manager"
      ],
      [
        "expo-background-fetch",
        {
          backgroundFetchInterval: 10
        }
      ]
    ],
    extra: {
      googleMapsApiKey: "AIzaSyBIHJUk4DuAG7tjp_gIdNhUJdpBKN1eM2Q"
    },
    experiments: {
      typedRoutes: true
    }
  }
};