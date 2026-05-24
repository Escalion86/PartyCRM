import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { setupNotificationListeners } from '../src/services/notifications'
import { useExpoPushNotifications } from '../src/shared/notifications/useExpoPushNotifications'

export default function RootLayout() {
  useExpoPushNotifications()

  useEffect(() => {
    const cleanup = setupNotificationListeners()
    return cleanup
  }, [])

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}
