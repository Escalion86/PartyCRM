import { NextResponse } from 'next/server'
import Calls from '@models/Calls'
import dbConnect from '@server/dbConnect'
import { buildEventDraftFromCall } from '@server/calls'
import { requireTelephonyTariffAccess } from '@server/telephonyAccess'

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

  const draft = await buildEventDraftFromCall(call, tenantId)
  return NextResponse.json({ success: true, data: draft }, { status: 200 })
}
