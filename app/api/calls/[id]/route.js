import { NextResponse } from 'next/server'
import Calls from '@models/Calls'
import dbConnect from '@server/dbConnect'
import {
  normalizeCallDirection,
  normalizeCallStatus,
  normalizePhoneDigits,
  normalizeRuPhone,
  parseOptionalDate,
  parseOptionalNumber,
} from '@server/calls'
import { requireTelephonyTariffAccess } from '@server/telephonyAccess'

const applyStringUpdate = (update, body, key) => {
  if (body[key] !== undefined) update[key] = String(body[key] || '').trim()
}

export const GET = async (req, { params }) => {
  const { id } = await params
  const access = await requireTelephonyTariffAccess()
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    )
  }
  const { tenantId } = access

  await dbConnect()
  const call = await Calls.findOne({ _id: id, tenantId }).lean()
  if (!call) {
    return NextResponse.json(
      { success: false, error: 'Звонок не найден' },
      { status: 404 }
    )
  }

  return NextResponse.json({ success: true, data: call }, { status: 200 })
}

export const PUT = async (req, { params }) => {
  const { id } = await params
  const body = await req.json()
  const access = await requireTelephonyTariffAccess()
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    )
  }
  const { tenantId } = access

  await dbConnect()
  const update = {}

  if (body.phone !== undefined) {
    update.phone = String(body.phone || '').trim()
    update.normalizedPhone = normalizeRuPhone(body.phone)
  }
  if (body.direction !== undefined)
    update.direction = normalizeCallDirection(body.direction)
  if (body.status !== undefined) update.status = normalizeCallStatus(body.status)
  if (body.startedAt !== undefined)
    update.startedAt = parseOptionalDate(body.startedAt)
  if (body.endedAt !== undefined) update.endedAt = parseOptionalDate(body.endedAt)
  if (body.durationSec !== undefined)
    update.durationSec = Math.max(0, parseOptionalNumber(body.durationSec, 0))
  if (body.recordingExpiresAt !== undefined)
    update.recordingExpiresAt = parseOptionalDate(body.recordingExpiresAt)
  if (body.linkedClientId !== undefined)
    update.linkedClientId = body.linkedClientId || null
  if (body.linkedEventId !== undefined)
    update.linkedEventId = body.linkedEventId || null
  if (body.normalizedPhone !== undefined)
    update.normalizedPhone = normalizePhoneDigits(body.normalizedPhone)

  applyStringUpdate(update, body, 'provider')
  applyStringUpdate(update, body, 'providerCallId')
  applyStringUpdate(update, body, 'recordingUrl')
  applyStringUpdate(update, body, 'recordingStorageKey')
  applyStringUpdate(update, body, 'transcript')
  applyStringUpdate(update, body, 'aiSummary')
  applyStringUpdate(update, body, 'processingError')

  const call = await Calls.findOneAndUpdate({ _id: id, tenantId }, update, {
    returnDocument: 'after',
  }).lean()

  if (!call) {
    return NextResponse.json(
      { success: false, error: 'Звонок не найден' },
      { status: 404 }
    )
  }

  return NextResponse.json({ success: true, data: call }, { status: 200 })
}
