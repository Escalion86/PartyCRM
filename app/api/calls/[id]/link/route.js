import { NextResponse } from 'next/server'
import Calls from '@models/Calls'
import Clients from '@models/Clients'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import { requireTelephonyTariffAccess } from '@server/telephonyAccess'

export const POST = async (req, { params }) => {
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
  const update = { status: 'linked', processingError: '' }

  if (body?.clientId) {
    const client = await Clients.findOne({ _id: body.clientId, tenantId }).lean()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Клиент не найден' },
        { status: 404 }
      )
    }
    update.linkedClientId = client._id
  }

  if (body?.eventId) {
    const event = await Events.findOne({ _id: body.eventId, tenantId }).lean()
    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Мероприятие не найдено' },
        { status: 404 }
      )
    }
    update.linkedEventId = event._id
  }

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
