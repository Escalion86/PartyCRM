import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'artistcrm_auth_token'

export const getAuthToken = () => SecureStore.getItemAsync(TOKEN_KEY)

export const setAuthToken = (token: string) =>
  SecureStore.setItemAsync(TOKEN_KEY, token)

export const clearAuthToken = () => SecureStore.deleteItemAsync(TOKEN_KEY)
