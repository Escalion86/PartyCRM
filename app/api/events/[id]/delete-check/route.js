import { NextResponse } from 'next/server'
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
  const event = await Events.findOne({ _id: id, tenantId }).lean()
  if (!event) {
    return NextResponse.json(
      { success: false, error: 'Мероприятие не найдено' },
      { status: 404 }
    )
  }

  const transactionsCount = await Transactions.countDocuments({
    tenantId,
    eventId: id,
  })

  const reasons = []
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
