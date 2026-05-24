'use client'

const isPushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

const isProductionSW =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'production'

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

const areByteArraysEqual = (left, right) => {
  if (!left || !right) return false
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false
  }
  return true
}

const getSubscriptionApplicationServerKey = (subscription) => {
  const key = subscription?.options?.applicationServerKey
  if (!key) return null
  if (key instanceof ArrayBuffer) return new Uint8Array(key)
  if (ArrayBuffer.isView(key)) {
    return new Uint8Array(key.buffer, key.byteOffset, key.byteLength)
  }
  return null
}

const getPushRegistration = async () => {
  if (!isPushSupported()) return null
  if (!isProductionSW) return null

  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing?.active) return existing

  if (!existing) {
    await navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => null)
  }

  const readyRegistration = await navigator.serviceWorker.ready.catch(
    () => null
  )
  if (readyRegistration?.active) return readyRegistration
  return existing || readyRegistration
}

const fetchPushPublicKey = async () => {
  const keyResponse = await fetch('/api/push/public-key')
  const keyPayload = await keyResponse.json().catch(() => ({}))
  if (!keyResponse.ok || !keyPayload?.data?.publicKey) {
    throw new Error(keyPayload?.error || 'Не удалось получить VAPID ключ')
  }
  return keyPayload.data.publicKey
}

const savePushSubscription = async (subscription) => {
  const saveResponse = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  })

  if (!saveResponse.ok) {
    const savePayload = await saveResponse.json().catch(() => ({}))
    throw new Error(savePayload?.error || 'Не удалось сохранить push-подписку')
  }
}

const syncPushSubscription = async ({
  registration,
  subscription,
  ensureLocalSubscription = false,
  forceNewSubscription = false,
} = {}) => {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'permission_not_granted' }
  }

  const currentRegistration = registration || (await getPushRegistration())
  if (!currentRegistration?.pushManager) {
    return { ok: false, reason: 'registration_not_ready' }
  }

  let currentSubscription =
    subscription ||
    (await currentRegistration.pushManager.getSubscription().catch(() => null))

  let publicKeyBytes = null
  if (ensureLocalSubscription || forceNewSubscription) {
    publicKeyBytes = urlBase64ToUint8Array(await fetchPushPublicKey())
  }

  if (currentSubscription && publicKeyBytes) {
    const subscriptionKey =
      getSubscriptionApplicationServerKey(currentSubscription)
    const keyChanged =
      subscriptionKey && !areByteArraysEqual(subscriptionKey, publicKeyBytes)

    if (forceNewSubscription || keyChanged) {
      await currentSubscription.unsubscribe().catch(() => null)
      currentSubscription = null
    }
  }

  if (!currentSubscription && ensureLocalSubscription) {
    currentSubscription = await currentRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKeyBytes,
    })
  }

  if (!currentSubscription) return { ok: false, reason: 'no_subscription' }

  await savePushSubscription(currentSubscription)
  return { ok: true, subscription: currentSubscription }
}

export {
  fetchPushPublicKey,
  getPushRegistration,
  isPushSupported,
  syncPushSubscription,
  urlBase64ToUint8Array,
}
