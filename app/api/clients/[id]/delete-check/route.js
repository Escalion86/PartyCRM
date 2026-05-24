import { NextResponse } from 'next/server'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

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
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'Клиент не найден' },
      { status: 404 }
    )
  }

  const eventsCount = await Events.countDocuments({ tenantId, clientId: id })
  const transactionsCount = await Transactions.countDocuments({
    tenantId,
    clientId: id,
  })
  const reasons = []
  if (eventsCount > 0)
    reasons.push({ type: 'events', count: eventsCount })
  if (transactionsCount > 0)
    reasons.push({ type: 'transactions', count: transactionsCount })

  return NextResponse.json(
    {
      success: true,
      data: {
        allowed: reasons.length === 0,
        reasons,
      },
    },
    { status: 200 }
  )
}
