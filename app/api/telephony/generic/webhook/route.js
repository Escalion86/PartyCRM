import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Calls from '@models/Calls'
import dbConnect from '@server/dbConnect'
import { normalizeCallInput } from '@server/calls'
import { isTelephonyTenantAllowed } from '@server/telephonyAccess'

const getHeader = (req, name) => req.headers.get(name) || ''

export const POST = async (req) => {
  const secret = process.env.TELEPHONY_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'Telephony webhook is not configured' },
      { status: 503 }
    )
  }

  const requestSecret =
    getHeader(req, 'x-telephony-secret') ||
    getHeader(req, 'authorization').replace(/^Bearer\s+/i, '')
  if (requestSecret !== secret) {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    )
  }

  const body = await req.json()
  const tenantId = String(body?.tenantId || '').trim()
  if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
    return NextResponse.json(
      { success: false, error: 'valid tenantId is required' },
      { status: 400 }
    )
  }

  await dbConnect()
  const isAllowed = await isTelephonyTenantAllowed(tenantId)
  if (!isAllowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'Telephony webhook is available only for developer tenants',
      },
      { status: 403 }
    )
  }

  const payload = await normalizeCallInput(body, tenantId)
  const update = {
    ...payload,
    tenantId,
    status: payload.transcript ? 'ready' : payload.status,
  }

  let call = null
  if (payload.providerCallId) {
    call = await Calls.findOneAndUpdate(
      {
        tenantId,
        provider: payload.provider,
        providerCallId: payload.providerCallId,
      },
      update,
      { upsert: true, returnDocument: 'after' }
    ).lean()
  } else {
    call = await Calls.create(update)
  }

  return NextResponse.json({ success: true, data: call }, { status: 200 })
}
