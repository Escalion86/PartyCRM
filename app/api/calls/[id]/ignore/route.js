import { NextResponse } from 'next/server'
import Calls from '@models/Calls'
import dbConnect from '@server/dbConnect'
import { requireTelephonyTariffAccess } from '@server/telephonyAccess'

export const POST = async (req, { params }) => {
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
  const call = await Calls.findOneAndUpdate(
    { _id: id, tenantId },
    { status: 'ignored', processingError: '' },
    { returnDocument: 'after' }
  ).lean()

  if (!call) {
    return NextResponse.json(
      { success: false, error: 'Звонок не найден' },
      { status: 404 }
    )
  }

  return NextResponse.json({ success: true, data: call }, { status: 200 })
}
