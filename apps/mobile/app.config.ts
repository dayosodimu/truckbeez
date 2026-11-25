import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json. The Android Google Maps key is a build-time value from the build
 * environment (EAS secret), never committed (non-negotiable #3). iOS uses Apple Maps.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    config: { ...config.android?.config, googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } },
  },
});
