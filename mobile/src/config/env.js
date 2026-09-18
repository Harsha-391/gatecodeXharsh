// mobile/src/config/env.js
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SERVER_URL_KEY = '@hospital_hms_server_url';
export const DEFAULT_LAN_API_URL = 'http://192.168.1.28:3000';

let inMemoryCustomUrl = null;

/**
 * Initializes and retrieves the stored server URL on startup.
 */
export async function loadSavedServerUrl() {
  try {
    const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
    if (saved && saved.trim()) {
      inMemoryCustomUrl = saved.trim().replace(/\/$/, '');
      return inMemoryCustomUrl;
    }
  } catch (_) {}
  return getResolvedApiUrl();
}

/**
 * Sets and permanently persists a custom server URL (e.g. Wi-Fi IP or Cloud / Tunnel URL).
 */
export async function saveServerUrl(url) {
  if (!url || !url.trim()) {
    inMemoryCustomUrl = null;
    try {
      await AsyncStorage.removeItem(SERVER_URL_KEY);
    } catch (_) {}
    return getResolvedApiUrl();
  }

  const cleanUrl = url.trim().replace(/\/$/, '');
  inMemoryCustomUrl = cleanUrl;
  try {
    await AsyncStorage.setItem(SERVER_URL_KEY, cleanUrl);
  } catch (_) {}
  return cleanUrl;
}

/**
 * Dynamically resolves the active API URL:
 * 1. Custom user-saved URL from settings
 * 2. EXPO_PUBLIC_API_URL if configured
 * 3. Metro host URI (physical device in Expo Go)
 * 4. Default LAN API URL (http://192.168.1.28:3000)
 */
export function getResolvedApiUrl() {
  if (inMemoryCustomUrl) {
    return inMemoryCustomUrl;
  }

  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/$/, '');
  }

  const hostUri = 
    Constants.expoConfig?.hostUri || 
    Constants.manifest2?.extra?.expoClient?.hostUri || 
    Constants.manifest?.debuggerHost;

  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:3000`;
    }
  }

  return DEFAULT_LAN_API_URL;
}

export const API_BASE_URL = getResolvedApiUrl();

export const APP_CONFIG = {
  appName: 'Medical HMS Mobile',
  version: '1.0.0',
  defaultLanUrl: DEFAULT_LAN_API_URL
};
