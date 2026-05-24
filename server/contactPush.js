import Users from '@models/Users'
import { sendPushToTenant } from '@server/pushNotifications'

/**
 * Push notification templates for contact events
 */
const CONTACT_PUSH_TEMPLATES = {
  created: (client) => ({
    title: 'Новый контакт',
    body: `${client.firstName || ''} ${client.secondName || ''}`.trim() || 'Новый контакт добавлен',
    data: {
      type: 'contact_created',
      clientId: String(client._id),
      url: `/cabinet/clients/${client._id}`,
    },
    tag: `contact-created-${client._id}`,
  }),
  updated: (client, changedFields) => {
    const name = `${client.firstName || ''} ${client.secondName || ''}`.trim() || 'Контакт'
    const fieldsDesc = changedFields?.length ? ` (${changedFields.join(', ')})` : ''
    return {
      title: 'Контакт обновлён',
      body: `${name}${fieldsDesc}`,
      data: {
        type: 'contact_updated',
        clientId: String(client._id),
        url: `/cabinet/clients/${client._id}`,
        changedFields: changedFields || [],
      },
      tag: `contact-updated-${client._id}`,
    }
  },
}

/**
 * Detect which meaningful fields changed between old and new client data
 */
const detectChangedFields = (oldData, newData) => {
  const trackedFields = [
    { key: 'firstName', label: 'имя' },
    { key: 'secondName', label: 'фамилия' },
    { key: 'thirdName', label: 'отчество' },
    { key: 'phone', label: 'телефон' },
    { key: 'email', label: 'email' },
    { key: 'telegram', label: 'telegram' },
    { key: 'whatsapp', label: 'whatsapp' },
    { key: 'vk', label: 'VK' },
    { key: 'comment', label: 'комментарий' },
    { key: 'clientType', label: 'тип' },
    { key: 'town', label: 'город' },
  ]

  const changed = []
  for (const { key, label } of trackedFields) {
    const oldVal = oldData?.[key]
    const newVal = newData?.[key]
    if (oldVal !== newVal) {
      // For empty strings and null, treat as equivalent "empty"
      const oldEmpty = !oldVal && oldVal !== 0
      const newEmpty = !newVal && newVal !== 0
      if (!(oldEmpty && newEmpty)) {
        changed.push(label)
      }
    }
  }
  return changed
}

/**
 * Check if user has enabled contact push notifications
 */
const isContactPushEnabled = async (tenantId, eventType) => {
  try {
    const user = await Users.findOne({ tenantId })
      .select('notifications')
      .lean()
    if (!user) return false

    const notifications = user.notifications || new Map()
    const contactPush = notifications.get('contactPush')
    // Default to true if not set
    if (!contactPush) return true

    return eventType === 'created'
      ? contactPush.created !== false
      : contactPush.updated !== false
  } catch (error) {
    console.warn('contact push preference check failed', {
      tenantId: String(tenantId),
      error: error?.message,
    })
    return true // Default to enabled on error
  }
}

/**
 * Send push notification for a new contact
 */
const sendContactCreatedPush = async ({ tenantId, client }) => {
  if (!tenantId || !client) return null

  const enabled = await isContactPushEnabled(tenantId, 'created')
  if (!enabled) return { ok: true, sent: 0, reason: 'disabled_by_user' }

  const template = CONTACT_PUSH_TEMPLATES.created(client)
  return sendPushToTenant({
    tenantId,
    source: 'contact_push',
    payload: {
      ...template,
      icon: '/icons/AppImages/android/android-launchericon-192-192.png',
      badge: '/icons/notification-badge.svg',
    },
  })
}

/**
 * Send push notification for an updated contact
 */
const sendContactUpdatedPush = async ({ tenantId, client, oldData }) => {
  if (!tenantId || !client) return null

  const enabled = await isContactPushEnabled(tenantId, 'updated')
  if (!enabled) return { ok: true, sent: 0, reason: 'disabled_by_user' }

  const changedFields = oldData ? detectChangedFields(oldData, client) : []
  // Only send push if meaningful fields changed
  if (changedFields.length === 0) return null

  const template = CONTACT_PUSH_TEMPLATES.updated(client, changedFields)
  return sendPushToTenant({
    tenantId,
    source: 'contact_push',
    payload: {
      ...template,
      icon: '/icons/AppImages/android/android-launchericon-192-192.png',
      badge: '/icons/notification-badge.svg',
    },
  })
}

export {
  sendContactCreatedPush,
  sendContactUpdatedPush,
  detectChangedFields,
  isContactPushEnabled,
  CONTACT_PUSH_TEMPLATES,
}
