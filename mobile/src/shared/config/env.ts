const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL
const rawAppScheme = process.env.EXPO_PUBLIC_APP_SCHEME

if (!rawApiBaseUrl) {
  console.warn('EXPO_PUBLIC_API_BASE_URL is not set')
}

export const env = {
  apiBaseUrl: rawApiBaseUrl || 'http://localhost:3000/api',
  appScheme: rawAppScheme || 'artistcrm',
}
