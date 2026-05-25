import { NextResponse } from 'next/server'
import Calls from '@models/Calls'
import dbConnect from '@server/dbConnect'
import { normalizeCallInput, processCallRecording } from '@server/calls'
import { isTelephonyTariffAllowedForTenant } from '@server/telephonyAccess'
import { logTelephonyWebhook } from '@server/telephonyWebhookLogger'
import {
  getNovofonSettings,
  getNovofonTenantId,
  getNovofonWebhookSecret,
  isValidTenantId,
  normalizeNovofonWebhook,
} from '@server/novofon'

const buildNovofonUpdate = (payload, normalized, tenantId) => {
  const update = {
    ...payload,
    tenantId,
    status: payload.transcript ? 'ready' : payload.status || 'new',
  }

  if (!normalized.phone) {
    delete update.phone
    delete update.normalizedPhone
    delete update.linkedClientId
  }
  if (!normalized.startedAt) delete update.startedAt
  if (!normalized.endedAt) delete update.endedAt
  if (!normalized.durationSec) delete update.durationSec
  if (!normalized.direction || normalized.direction === 'unknown') {
    delete update.direction
  }

  return update
}

const parseWebhookBody = async (req) => {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return req.json().catch(() => ({}))
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await req.formData().catch(() => null)
    if (!formData) return {}
    return Object.fromEntries(formData.entries())
  }

  const text = await req.text().catch(() => '')
  if (!text.trim()) return {}

  try {
    return JSON.parse(text)
  } catch (error) {
    return Object.fromEntries(new URLSearchParams(text).entries())
  }
}

const getSearchParamsPayload = (searchParams) =>
  Object.fromEntries(searchParams.entries())

const logNovofonWebhook = (entry) =>
  logTelephonyWebhook({
    provider: 'novofon',
    ...entry,
  })

const notifyCallRecordingReady = async () => {}

const handleNovofonWebhook = async (req) => {
  const { searchParams } = new URL(req.url)
  const body = {
    ...getSearchParamsPayload(searchParams),
    ...(await parseWebhookBody(req)),
  }
  await dbConnect()

  const tenantId = getNovofonTenantId(body, searchParams)
  if (!isValidTenantId(tenantId)) {
    await logNovofonWebhook({
      body,
      status: 'rejected',
      httpStatus: 400,
      reason: 'invalid_tenant_id',
      message: 'Novofon webhook rejected: valid tenantId is required',
    })
    return NextResponse.json(
      { success: false, error: 'valid tenantId is required' },
      { status: 400 }
    )
  }

  const settings = await getNovofonSettings(tenantId)
  const fallbackSecret =
    process.env.NOVOFON_WEBHOOK_SECRET || process.env.TELEPHONY_WEBHOOK_SECRET
  const expectedSecret = settings?.webhookSecret || fallbackSecret

  if (!settings?.enabled && !fallbackSecret) {
    await logNovofonWebhook({
      tenantId,
      body,
      status: 'rejected',
      httpStatus: 403,
      reason: 'integration_disabled',
      message: 'Novofon webhook rejected: integration is disabled',
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Novofon integration is disabled for this tenant',
      },
      { status: 403 }
    )
  }

  if (!expectedSecret) {
    await logNovofonWebhook({
      tenantId,
      body,
      status: 'rejected',
      httpStatus: 503,
      reason: 'missing_secret',
      message: 'Novofon webhook rejected: webhook is not configured',
    })
    return NextResponse.json(
      { success: false, error: 'Novofon webhook is not configured' },
      { status: 503 }
    )
  }

  if (getNovofonWebhookSecret(req, body, searchParams) !== expectedSecret) {
    await logNovofonWebhook({
      tenantId,
      body,
      status: 'rejected',
      httpStatus: 403,
      reason: 'secret_mismatch',
      message: 'Novofon webhook rejected: secret mismatch',
    })
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    )
  }

  const hasTariffAccess = await isTelephonyTariffAllowedForTenant(tenantId)
  if (!hasTariffAccess) {
    await logNovofonWebhook({
      tenantId,
      body,
      status: 'rejected',
      httpStatus: 403,
      reason: 'telephony_tariff_required',
      message: 'Novofon webhook rejected: telephony tariff option is disabled',
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Novofon integration is available only with telephony tariff option',
      },
      { status: 403 }
    )
  }

  const normalized = normalizeNovofonWebhook(body)
  await logNovofonWebhook({
    tenantId,
    body,
    eventType: normalized.rawEvent,
    status: 'received',
    httpStatus: 200,
    reason: 'accepted_for_processing',
    message: 'Novofon webhook accepted for call normalization',
    providerCallId: normalized.providerCallId,
    direction: normalized.direction,
    hasRecordingUrl: Boolean(normalized.recordingUrl),
    hasTranscript: Boolean(normalized.transcript),
  })
  const payload = await normalizeCallInput(normalized, tenantId)
  const update = buildNovofonUpdate(payload, normalized, tenantId)

  let call = null
  let existingCall = null
  if (payload.providerCallId) {
    existingCall = await Calls.findOne({
      tenantId,
      provider: 'novofon',
      providerCallId: payload.providerCallId,
    })
      .select('_id status recordingUrl recordingPushSentAt')
      .lean()
    if (
      !payload.transcript &&
      ['linked', 'ignored'].includes(existingCall?.status)
    ) {
      update.status = existingCall.status
    }
    call = await Calls.findOneAndUpdate(
      {
        tenantId,
        provider: 'novofon',
        providerCallId: payload.providerCallId,
      },
      update,
      { upsert: true, returnDocument: 'after' }
    ).lean()
  } else {
    call = await Calls.create(update)
  }

  const shouldNotifyRecording =
    call?.recordingUrl &&
    (!existingCall?.recordingPushSentAt ||
      existingCall?.recordingUrl !== call.recordingUrl)

  await logNovofonWebhook({
    tenantId,
    body,
    eventType: normalized.rawEvent,
    status: 'saved',
    httpStatus: 200,
    reason: shouldNotifyRecording ? 'call_saved_with_recording' : 'call_saved',
    message: 'Novofon webhook saved call',
    providerCallId: payload.providerCallId,
    direction: call?.direction || payload.direction,
    hasRecordingUrl: Boolean(call?.recordingUrl),
    hasTranscript: Boolean(call?.transcript),
    callId: call?._id || null,
    meta: {
      linkedClient: Boolean(call?.linkedClientId),
      shouldNotifyRecording,
    },
  })

  const shouldAutoProcessRecording =
    call?.recordingUrl && call?.linkedClientId && !call?.transcript

  if (shouldAutoProcessRecording) {
    try {
      call = await processCallRecording(call._id, tenantId)
      await logNovofonWebhook({
        tenantId,
        body,
        eventType: normalized.rawEvent,
        status: 'processed',
        httpStatus: 200,
        reason: 'recording_auto_processed',
        message: 'Novofon recording auto transcribed and analyzed',
        providerCallId: payload.providerCallId,
        direction: call?.direction || payload.direction,
        hasRecordingUrl: Boolean(call?.recordingUrl),
        hasTranscript: Boolean(call?.transcript),
        callId: call?._id || null,
        meta: {
          linkedClient: Boolean(call?.linkedClientId),
        },
      })
    } catch (error) {
      call = await Calls.findOne({ _id: call._id, tenantId }).lean()
      await logNovofonWebhook({
        tenantId,
        body,
        eventType: normalized.rawEvent,
        status: 'failed',
        httpStatus: 200,
        reason: 'recording_auto_process_failed',
        message: error?.message || 'Novofon recording auto processing failed',
        providerCallId: payload.providerCallId,
        direction: call?.direction || payload.direction,
        hasRecordingUrl: Boolean(call?.recordingUrl),
        hasTranscript: Boolean(call?.transcript),
        callId: call?._id || null,
        meta: {
          linkedClient: Boolean(call?.linkedClientId),
        },
      })
    }
  }

  if (shouldNotifyRecording) {
    await notifyCallRecordingReady({ tenantId, call })
    call = await Calls.findOneAndUpdate(
      { _id: call._id, tenantId },
      {
        recordingPushSentAt: new Date(),
        eventPromptSentAt: new Date(),
        eventDecision: call.eventDecision || 'pending',
      },
      { returnDocument: 'after' }
    ).lean()
  }

  return NextResponse.json({ success: true, data: call }, { status: 200 })
}

export const GET = handleNovofonWebhook
export const POST = handleNovofonWebhook
