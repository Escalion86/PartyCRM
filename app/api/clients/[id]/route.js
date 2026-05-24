import { NextResponse } from 'next/server'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { sendContactUpdatedPush } from '@server/contactPush'

export const GET = async (req, { params }) => {
  const { id } = await params
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const client = await Clients.findOne({ _id: id, tenantId }).lean()
  if (!client)
    return NextResponse.json(
      { success: false, error: 'Клиент не найден' },
      { status: 404 }
    )
  return NextResponse.json({ success: true, data: client }, { status: 200 })
}

export const PUT = async (req, { params }) => {
  const { id } = await params
  const body = await req.json()
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()

  // Fetch old client data for change detection
  const oldClient = await Clients.findOne({ _id: id, tenantId }).lean()

  const client = await Clients.findOneAndUpdate(
    { _id: id, tenantId },
    body,
    {
      returnDocument: 'after',
    }
  )
  if (!client)
    return NextResponse.json(
      { success: false, error: 'Клиент не найден' },
      { status: 404 }
    )

  // Send push notification asynchronously (don't block response)
  sendContactUpdatedPush({ tenantId, client, oldData: oldClient }).catch((err) => {
    console.warn('contact push notification failed', {
      tenantId: String(tenantId),
      clientId: String(client._id),
      error: err?.message,
    })
  })

  return NextResponse.json({ success: true, data: client }, { status: 200 })
}

export const DELETE = async (req, { params }) => {
  const { id } = await params
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const eventsCount = await Events.countDocuments({ tenantId, clientId: id })
  if (eventsCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Нельзя удалить клиента: есть связанные мероприятия (${eventsCount})`,
      },
      { status: 409 }
    )
  }
  const transactionsCount = await Transactions.countDocuments({
    tenantId,
    clientId: id,
  })
  if (transactionsCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Нельзя удалить клиента: есть связанные транзакции (${transactionsCount})`,
      },
      { status: 409 }
    )
  }
  const deleted = await Clients.findOneAndDelete({ _id: id, tenantId })
  if (!deleted)
    return NextResponse.json(
      { success: false, error: 'Клиент не найден' },
      { status: 404 }
    )
  return NextResponse.json(
    { success: true, data: { _id: String(id) } },
    { status: 200 }
  )
}
