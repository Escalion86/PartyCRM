import { NextResponse } from 'next/server'
import {
  getPartyOrderModel,
  getPartyTransactionModel,
} from '@server/partyModels'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import {
  buildPartyFinanceCsv,
  filterPartyOrdersByEventPeriod,
} from '@helpers/partyFinanceCsv'

const attachTransactions = (orders = [], transactions = []) => {
  const transactionsByOrderId = transactions.reduce((map, transaction) => {
    const orderId = String(transaction.orderId)
    if (!map.has(orderId)) map.set(orderId, [])
    map.get(orderId).push({
      _id: String(transaction._id),
      amount: Number(transaction.amount || 0),
      type: transaction.type,
      category: transaction.category,
      date: transaction.date ? new Date(transaction.date).toISOString() : null,
      comment: transaction.comment || '',
      paymentMethod: transaction.paymentMethod || 'transfer',
    })
    return map
  }, new Map())

  return orders.map((order) => {
    const orderTransactions = transactionsByOrderId.get(String(order._id))
    return {
      ...order,
      transactions:
        orderTransactions && orderTransactions.length > 0
          ? orderTransactions
          : order.transactions,
    }
  })
}

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const { serializedAccess } = await getPartyCompanyTariffAccessState(
    context.company
  )
  if (serializedAccess.allowStatistics === false) {
    return partyError(
      403,
      'partycrm_statistics_not_allowed',
      'Финансы и аналитика недоступны на текущем тарифе компании',
      'permission'
    )
  }

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('from') || ''
  const dateTo = searchParams.get('to') || ''
  const PartyOrders = await getPartyOrderModel()
  const orders = await PartyOrders.find({
    tenantId: context.tenantId,
    status: { $ne: 'canceled' },
  })
    .sort({ eventDate: 1, createdAt: -1 })
    .lean()
  const periodOrders = filterPartyOrdersByEventPeriod(orders, {
    dateFrom,
    dateTo,
  })
  const orderIds = periodOrders.map((order) => String(order._id))
  const PartyTransactions = await getPartyTransactionModel()
  const transactions = orderIds.length
    ? await PartyTransactions.find({
        tenantId: context.tenantId,
        orderId: { $in: orderIds },
      })
        .sort({ date: -1, createdAt: -1 })
        .lean()
    : []
  const csv = buildPartyFinanceCsv(attachTransactions(periodOrders, transactions))
  const suffix = [dateFrom, dateTo].filter(Boolean).join('_') || 'all'

  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="partycrm-finance-${suffix}.csv"`,
    },
  })
}

export const dynamic = 'force-dynamic'
