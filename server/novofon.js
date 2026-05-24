import mongoose from 'mongoose'
import SiteSettings from '@models/SiteSettings'
import { normalizeCallDirection, parseOptionalDate } from '@server/calls'

const getFirstString = (...values) => {
  const value = values.find(
    (item) => item !== undefined && item !== null && String(item).trim()
  )
  return value === undefined || value === null ? '' : String(value).trim()
}

const normalizeDate = (...values) => {
  const value = getFirstString(...values)
  if (!value) return null
  return parseOptionalDate(value.replace(' ', 'T')) ?? parseOptionalDate(value)
}

const normalizeNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const parseMaybeObject = (value) => {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    return null
  }
}

const getObjectValue = (object, ...keys) => {
  if (!object || typeof object !== 'object') return ''
  return getFirstString(...keys.map((key) => object?.[key]))
}

const normalizeNovofonDirection = (value) => {
  const normalized = String(value || '').toLowerCase()
  if (['in', 'incoming', 'входящий'].includes(normalized)) return 'incoming'
  if (['out', 'outgoing', 'исходящий'].includes(normalized)) return 'outgoing'
  if (normalized.includes('исход')) return 'outgoing'
  if (normalized.includes('вход')) return 'incoming'
  if (normalized.includes('out')) return 'outgoing'
  if (normalized.includes('in')) return 'incoming'
  return normalizeCallDirection(value)
}

export const getNovofonTenantId = (body, searchParams) =>
  getFirstString(
    body?.tenantId,
    body?.tenant_id,
    body?.crm_tenant_id,
    searchParams?.get('tenantId'),
    searchParams?.get('tenant_id')
  )

export const getNovofonWebhookSecret = (req, body, searchParams) =>
  getFirstString(
    req.headers.get('x-novofon-secret'),
    req.headers.get('x-telephony-secret'),
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
    body?.secret,
    body?.token,
    body?.webhook_secret,
    searchParams?.get('secret'),
    searchParams?.get('token')
  )

export const isValidTenantId = (tenantId) =>
  Boolean(tenantId && mongoose.Types.ObjectId.isValid(String(tenantId)))

export const getNovofonSettings = async (tenantId) => {
  if (!isValidTenantId(tenantId)) return null
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const custom = siteSettings?.custom ?? {}
  const getValue = (key) =>
    typeof custom?.get === 'function' ? custom.get(key) : custom?.[key]

  return {
    enabled: getValue('novofonEnabled') === true,
    webhookSecret: getFirstString(getValue('novofonWebhookSecret')),
    apiKey: getFirstString(getValue('novofonApiKey')),
  }
}

export const normalizeNovofonWebhook = (body = {}) => {
  const contactInfo = parseMaybeObject(body.contact_info)
  const employeeInfo = parseMaybeObject(body.employee_info)
  const callRecordFileInfo = parseMaybeObject(body.call_record_file_info)
  const direction = normalizeNovofonDirection(
    getFirstString(
      body.direction,
      body.call_direction,
      body.call_type,
      body.notification_name
    )
  )
  const event = getFirstString(
    body.event,
    body.event_type,
    body.type,
    body.notification_name
  )
  const providerCallId = getFirstString(
    body.call_id,
    body.call_session_id,
    body.session_id,
    body.talk_id,
    body.pbx_call_id,
    body.id
  )
  const incomingPhone = getFirstString(
    body.contact_phone_number,
    getObjectValue(
      contactInfo,
      'contact_phone_number',
      'phone_number',
      'phone',
      'number'
    ),
    body.caller_id,
    body.caller,
    body.src,
    body.from,
    body.client_phone,
    body.phone
  )
  const outgoingPhone = getFirstString(
    body.communication_number,
    getObjectValue(
      employeeInfo,
      'communication_number',
      'phone_number',
      'phone',
      'number'
    ),
    body.called_did,
    body.called,
    body.dst,
    body.to,
    body.destination,
    body.phone
  )
  const fallbackDirection =
    direction === 'unknown' && incomingPhone ? 'incoming' : direction
  const phone =
    fallbackDirection === 'outgoing'
      ? outgoingPhone || incomingPhone
      : incomingPhone || outgoingPhone
  const recordingUrl = getFirstString(
    getObjectValue(callRecordFileInfo, 'file_link'),
    body.file_link,
    body.record_file_link,
    body.recording_url,
    body.record_url,
    body.record_link
  )
  const startedAt = normalizeDate(
    body.start_time,
    body.started_at,
    body.call_start,
    body.created_at,
    body.notification_time,
    body.date
  )
  const endedAt = normalizeDate(
    body.finish_time,
    body.end_time,
    body.ended_at,
    body.call_end
  )
  const durationSec = normalizeNumber(
    getFirstString(
      body.duration,
      body.duration_sec,
      body.billsec,
      getObjectValue(callRecordFileInfo, 'call_record_duration', 'file_duration'),
      body.file_duration
    ),
    0
  )

  return {
    provider: 'novofon',
    providerCallId,
    direction: fallbackDirection,
    phone,
    startedAt,
    endedAt,
    durationSec,
    status: body.transcript ? 'ready' : 'new',
    recordingUrl,
    transcript: getFirstString(body.transcript, body.speech_text, body.text),
    processingError: '',
    rawEvent: event,
  }
}
