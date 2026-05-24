import TelephonyWebhookLogs from '@models/TelephonyWebhookLogs'

const MAX_MESSAGE_LENGTH = 500
const MAX_REASON_LENGTH = 120
const MAX_PAYLOAD_KEYS = 80

const sanitizePayloadKeys = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return []
  return Object.keys(body)
    .filter((key) => !/secret|token|key|password|record|file|transcript|text/i.test(key))
    .slice(0, MAX_PAYLOAD_KEYS)
    .sort()
}

const normalizeLogEntry = ({
  tenantId = null,
  provider = '',
  eventType = '',
  status,
  httpStatus = null,
  reason = '',
  message = '',
  providerCallId = '',
  direction = '',
  hasRecordingUrl = false,
  hasTranscript = false,
  callId = null,
  body = null,
  meta = undefined,
}) => ({
  tenantId: tenantId || null,
  provider: String(provider || '').slice(0, 60),
  eventType: String(eventType || '').slice(0, 120),
  status: String(status || 'unknown').slice(0, 60),
  httpStatus: Number.isFinite(Number(httpStatus)) ? Number(httpStatus) : null,
  reason: String(reason || '').slice(0, MAX_REASON_LENGTH),
  message: String(message || '').slice(0, MAX_MESSAGE_LENGTH),
  providerCallId: String(providerCallId || '').slice(0, 160),
  direction: String(direction || '').slice(0, 40),
  hasRecordingUrl: Boolean(hasRecordingUrl),
  hasTranscript: Boolean(hasTranscript),
  callId: callId || null,
  payloadKeys: sanitizePayloadKeys(body),
  meta,
})

export const logTelephonyWebhook = async (entry) => {
  const normalized = normalizeLogEntry(entry)
  const consolePayload = {
    ...normalized,
    tenantId: normalized.tenantId ? String(normalized.tenantId) : '',
    callId: normalized.callId ? String(normalized.callId) : '',
  }

  const consoleMethod =
    normalized.status === 'rejected' || normalized.status === 'failed'
      ? 'warn'
      : 'info'
  console[consoleMethod]('[telephony/webhook]', consolePayload)

  try {
    return await TelephonyWebhookLogs.create(normalized)
  } catch (error) {
    console.warn('[telephony/webhook] db log failed', {
      provider: normalized.provider,
      status: normalized.status,
      reason: normalized.reason,
      error: error?.message,
    })
    return null
  }
}
