import { useEffect, useRef, useCallback } from 'react'
import * as Notifications from 'expo-notifications'
import { Platform, AppState } from 'react-native'
import { router } from 'expo-router'
import { env } from '../config/env'
import { getAuthToken } from '../auth/tokenStore'

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async (): Promise<Notifications.NotificationBehavior> => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
})

const registerPushTokenOnServer = async (token: string) => {
  try {
    const authToken = await getAuthToken()
    if (!authToken) return

    await fetch(`${env.apiBaseUrl.replace(/\/$/, '')}/push/expo/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        pushToken: token,
        deviceId: '',
        platform: Platform.OS,
        appVersion: Platform.Version?.toString() || '',
      }),
    })
  } catch (error) {
    console.log('Failed to register push token', error)
  }
}

const unregisterPushTokenOnServer = async (token: string) => {
  try {
    const authToken = await getAuthToken()
    if (!authToken) return

    await fetch(`${env.apiBaseUrl.replace(/\/$/, '')}/push/expo/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ pushToken: token }),
    })
  } catch (error) {
    console.log('Failed to unregister push token', error)
  }
}

const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
  const data = response?.notification?.request?.content?.data as Record<string, string> | undefined
  if (!data?.url) return

  const url = data.url
  if (url.includes('openEvent=')) {
    router.push('/(tabs)/events')
  } else if (url.includes('/cabinet/')) {
    router.push('/(tabs)/tasks')
  } else {
    router.push('/(tabs)/tasks')
  }
}

export const useExpoPushNotifications = () => {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)
  const appStateRef = useRef(AppState.currentState)
  const pushTokenRef = useRef<string | null>(null)

  const isDevice = () => {
    // expo-device not available; assume true on mobile platforms
    return Platform.OS === 'android' || Platform.OS === 'ios'
  }

  const registerForPushNotifications = useCallback(async (): Promise<string | null> => {
    if (!isDevice()) {
      console.log('Push notifications require a physical device')
      return null
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied')
      return null
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '7676a13a-3d4a-4da0-ad23-5b4df7b3bb38',
      })
      const token = tokenData.data

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        })
      }

      pushTokenRef.current = token
      await registerPushTokenOnServer(token)
      return token
    } catch (error) {
      console.log('Failed to get push token', error)
      return null
    }
  }, [])

  useEffect(() => {
    registerForPushNotifications()

    notificationListener.current = Notifications.addNotificationReceivedListener(
      () => {
        // Notification will be shown automatically by the handler
      }
    )

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        handleNotificationResponse(response)
      }
    )

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        if (pushTokenRef.current) {
          registerPushTokenOnServer(pushTokenRef.current)
        }
      }
      appStateRef.current = nextAppState
    })

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current)
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current)
      }
      subscription?.remove()
    }
  }, [registerForPushNotifications])

  return {
    registerForPushNotifications,
  }
}
