import { NextResponse } from 'next/server'
import Clients from '@models/Clients'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { sendContactCreatedPush } from '@server/contactPush'

export const GET = async () => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const clients = await Clients.find({ tenantId })
    .sort({ firstName: 1 })
    .lean()
  return NextResponse.json({ success: true, data: clients }, { status: 200 })
}

export const POST = async (req) => {
  const body = await req.json()
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const client = await Clients.create({ ...body, tenantId })

  // Send push notification asynchronously (don't block response)
  sendContactCreatedPush({ tenantId, client }).catch((err) => {
    console.warn('contact push notification failed', {
      tenantId: String(tenantId),
      clientId: String(client._id),
      error: err?.message,
    })
  })

  return NextResponse.json({ success: true, data: client }, { status: 201 })
}
