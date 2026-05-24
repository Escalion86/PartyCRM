import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { getAuthToken } from '../shared/auth/tokenStore'
import { env } from '../shared/config/env'

interface NotificationData {
  type?: string
  clientId?: string
  url?: string
}

/**
 * Handle notification tap - navigate based on notification data
 */
export function handleNotificationTap(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as NotificationData | undefined
  if (!data) return

  const { type, clientId, url } = data

  if (url) {
    router.push(url as any)
    return
  }

  if (type === 'contact_created' || type === 'contact_updated') {
    if (clientId) {
      router.push(`/clients/${clientId}` as any)
    } else {
      router.push('/clients' as any)
    }
  }
}

/**
 * Set up notification listeners (call once in app root)
 */
export function setupNotificationListeners(): () => void {
  const foregroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('Notification received in foreground:', notification)
    }
  )

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      handleNotificationTap(response)
    }
  )

  return () => {
    foregroundSubscription.remove()
    responseSubscription.remove()
  }
}

/**
 * Get contact push preferences from server
 */
export async function getContactPushPreferences(): Promise<{
  created: boolean
  updated: boolean
} | null> {
  const authToken = await getAuthToken()
  if (!authToken) return null

  try {
    const response = await fetch(`${env.apiBaseUrl}/push/contacts`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.data
  } catch (error) {
    console.warn('Error fetching contact push preferences:', error)
    return null
  }
}

/**
 * Update contact push preferences on server
 */
export async function updateContactPushPreferences(preferences: {
  created?: boolean
  updated?: boolean
}): Promise<boolean> {
  const authToken = await getAuthToken()
  if (!authToken) return false

  try {
    const response = await fetch(`${env.apiBaseUrl}/push/contacts`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(preferences),
    })
    return response.ok
  } catch (error) {
    console.warn('Error updating contact push preferences:', error)
    return false
  }
}
