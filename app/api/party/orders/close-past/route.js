import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { NextResponse } from 'next/server'
import {
  getPartyOrderModel,
  getPartyTransactionModel,
} from '@server/partyModels'
import { getPartyRequestContext } from '@server/partyApi'
import { getPartyOrderCloseReadiness } from '@helpers/partyOrderCloseReadiness'
import { syncPartyOrderCalendarAfterCrud } from '@server/partyOrderCalendarHooks'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const PartyOrders = await getPartyOrderModel()
  const today = startOfToday()
  const match = {
    tenantId: context.tenantId,
    status: { $in: ['draft', 'active'] },
    $or: [
      { dateEnd: { $lt: today } },
      {
        $and: [
          { $or: [{ dateEnd: null }, { dateEnd: { $exists: false } }] },
          { eventDate: { $lt: today } },
        ],
      },
    ],
  }

  const orders = await PartyOrders.find(match).lean()
  const orderIds = orders.map((order) => String(order._id))
  const PartyTransactions = await getPartyTransactionModel()
  const transactions = orderIds.length
    ? await PartyTransactions.find({
        tenantId: context.tenantId,
        orderId: { $in: orderIds },
      }).lean()
    : []
  const transactionsByOrderId = transactions.reduce((map, transaction) => {
    const orderId = String(transaction.orderId)
    if (!map.has(orderId)) map.set(orderId, [])
    map.get(orderId).push(transaction)
    return map
  }, new Map())
  const closed = []
  const skipped = []

  orders.forEach((order) => {
    const orderId = String(order._id)
    const orderTransactions = transactionsByOrderId.get(orderId) ?? []
    const readiness = getPartyOrderCloseReadiness({
      order,
      transactions:
        orderTransactions.length > 0 ? orderTransactions : order.transactions,
    })
    if (readiness.ok) {
      closed.push({ orderId, summary: readiness.summary })
      return
    }
    skipped.push({
      orderId,
      blockers: readiness.blockers,
      summary: readiness.summary,
    })
  })
  const candidates = [...closed]
  closed.length = 0
  for (const candidate of candidates) {
    const original = orders.find((order) => String(order._id) === candidate.orderId)
    const updated = await PartyOrders.findOneAndUpdate(
      { _id: candidate.orderId, tenantId: context.tenantId, ...getPartyOrderWriteGuard(original) },
      { $set: { status: 'closed' }, $inc: { commercialRevision: 1 } },
      { returnDocument: 'after' }
    ).lean()
    if (updated) closed.push(candidate)
    else skipped.push({
      orderId: candidate.orderId,
      blockers: [{ code: 'order_changed', message: 'Заказ изменился во время проверки. Повторите закрытие.' }],
      summary: candidate.summary,
    })
  }
  const closedIds = closed.map((item) => item.orderId)
  if (closedIds.length > 0) {
    await Promise.all(
      closedIds.map((orderId) =>
        Promise.all([
          syncPartyOrderCalendarAfterCrud({
            tenantId: context.tenantId,
            orderId,
            previousOrder: orders.find((order) => String(order._id) === orderId),
          }),
          recordPartyOrderAudit({
            context,
            orderId,
            order: {
              ...orders.find((order) => String(order._id) === orderId),
              status: 'closed',
            },
            previousOrder: orders.find((order) => String(order._id) === orderId),
            action: 'order_status_changed',
            summary: 'Закрыл прошедший заказ',
          }),
        ])
      )
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      closedCount: closed.length,
      closedIds: closed.map((item) => item.orderId),
      closed: closed,
      skipped,
    },
  })
}
