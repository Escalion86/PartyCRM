import SiteSettings from '@models/SiteSettings'
import {
  countActivePushSubscriptions,
  logPushDelivery,
  sendPushToTenant,
} from '@server/pushNotifications'

const readCustomValue = (custom, key) =>
  typeof custom?.get === 'function' ? custom.get(key) : custom?.[key]

const formatPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits[0] === '7') {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }
  if (digits.length === 11 && digits[0] === '8') {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }
  if (digits.length === 10) {
    return `+7 ${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`
  }
  return digits ? `+${digits}` : ''
}

const isCallPushEnabled = async (tenantId) => {
  if (!tenantId) return false
  const [siteSettings, activeSubscriptions] = await Promise.all([
    SiteSettings.findOne({ tenantId }).lean(),
    countActivePushSubscriptions(tenantId),
  ])
  const configured =
    readCustomValue(siteSettings?.custom, 'publicLeadPushEnabled') === true
  return configured || activeSubscriptions > 0
}

export const notifyCallRecordingReady = async ({ tenantId, call }) => {
  if (!tenantId || !call?._id || !call?.recordingUrl) return null
  const enabled = await isCallPushEnabled(tenantId)
  if (!enabled) {
    await logPushDelivery({
      tenantId,
      source: 'novofon',
      eventType: 'send',
      status: 'skipped',
      payloadType: 'novofon_recording',
      message: 'Push по записи звонка пропущен: уведомления не включены',
      meta: { callId: String(call._id) },
    })
    return null
  }

  const phone = formatPhone(call.normalizedPhone || call.phone)
  const payload = {
    title: 'Получена запись звонка',
    body: phone
      ? `Звонок с ${phone}. Создать заявку из разговора?`
      : 'Создать заявку из разговора?',
    icon: '/icons/AppImages/android/android-launchericon-192-192.png',
    badge: '/icons/notification-badge.svg',
    tag: `novofon-recording-${call._id}`,
    requireInteraction: true,
    actions: [
      { action: 'create_event', title: 'Да' },
      { action: 'no_event', title: 'Нет' },
    ],
    data: {
      url: `/cabinet/calls?callId=${call._id}`,
      callId: String(call._id),
      type: 'novofon_recording',
    },
  }

  return sendPushToTenant({ tenantId, payload, source: 'novofon' })
}
