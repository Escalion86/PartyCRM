import Expo from 'expo-server-sdk'
import ExpoPushTokens from '@models/ExpoPushTokens'

let expo = null

const getExpoClient = () => {
  if (!expo) {
    expo = new Expo.Expo()
  }
  return expo
}

const isExpoPushToken = (value) => {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.startsWith('ExponentPushToken[') || trimmed.startsWith('ExpoPushToken[')
}

const normalizePushToken = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (isExpoPushToken(trimmed)) return trimmed
  return ''
}

const saveExpoPushToken = async ({
  tenantId,
  pushToken,
  deviceId = '',
  platform = '',
  appVersion = '',
}) => {
  const normalized = normalizePushToken(pushToken)
  if (!tenantId || !normalized) return null

  return ExpoPushTokens.findOneAndUpdate(
    { tenantId, pushToken: normalized },
    {
      $set: {
        tenantId,
        pushToken: normalized,
        deviceId: String(deviceId || '').slice(0, 200),
        platform: ['android', 'ios'].includes(platform) ? platform : '',
        appVersion: String(appVersion || '').slice(0, 50),
        isActive: true,
      },
    },
    { upsert: true, returnDocument: 'after' }
  )
}

const deactivateExpoPushToken = async ({ tenantId, pushToken }) => {
  const normalized = normalizePushToken(pushToken)
  if (!tenantId || !normalized) return 0
  const result = await ExpoPushTokens.updateOne(
    { tenantId, pushToken: normalized },
    { $set: { isActive: false } }
  )
  return Number(result?.modifiedCount || 0)
}

const getActiveTokensForTenant = async (tenantId) => {
  if (!tenantId) return []
  const docs = await ExpoPushTokens.find({ tenantId, isActive: true })
    .select('pushToken')
    .lean()
  return docs
    .map((d) => normalizePushToken(d?.pushToken))
    .filter(Boolean)
}

const sendExpoPushToTenant = async ({ tenantId, payload }) => {
  if (!tenantId || !payload || typeof payload !== 'object') {
    return { ok: false, sent: 0, failed: 0, invalid: 0 }
  }

  const tokens = await getActiveTokensForTenant(tenantId)
  if (tokens.length === 0) {
    return { ok: true, sent: 0, failed: 0, invalid: 0 }
  }

  const expoClient = getExpoClient()

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title: payload?.title || '',
    body: payload?.body || '',
    data: payload?.data || {},
    priority: payload?.priority || 'high',
    badge: payload?.badge,
    channelId: payload?.channelId || 'default',
  }))

  const chunks = expoClient.chunkPushNotifications(messages)
  let sent = 0
  let failed = 0
  const invalidTokens = []

  for (const chunk of chunks) {
    try {
      const receipts = await expoClient.sendPushNotificationsAsync(chunk)
      receipts.forEach((receipt, index) => {
        if (receipt.status === 'ok') {
          sent += 1
        } else if (receipt.status === 'error') {
          failed += 1
          const code = receipt.details?.error
          if (code === 'DeviceNotRegistered' || code === 'InvalidCredentials') {
            invalidTokens.push(chunk[index]?.to || '')
          }
        }
      })
    } catch (error) {
      failed += chunk.length
    }
  }

  // Deactivate invalid tokens
  if (invalidTokens.length > 0) {
    await ExpoPushTokens.updateMany(
      { tenantId, pushToken: { $in: invalidTokens } },
      { $set: { isActive: false } }
    )
  }

  // Update lastSentAt for active tokens
  if (sent > 0) {
    await ExpoPushTokens.updateMany(
      { tenantId, pushToken: { $in: tokens }, isActive: true },
      { $set: { lastSentAt: new Date() } }
    )
  }

  return {
    ok: true,
    sent,
    failed,
    invalidTokens,
    invalid: invalidTokens.length,
  }
}

export {
  isExpoPushToken,
  normalizePushToken,
  saveExpoPushToken,
  deactivateExpoPushToken,
  getActiveTokensForTenant,
  sendExpoPushToTenant,
}
