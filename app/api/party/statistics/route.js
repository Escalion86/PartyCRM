import { NextResponse } from 'next/server'
import { getPartyClientModel, getPartyOrderModel, getPartyServiceModel, getPartyTransactionModel } from '@server/partyModels'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error

  const { serializedAccess } = await getPartyCompanyTariffAccessState(context.company)
  if (serializedAccess.allowStatistics === false) {
    return partyError(403, 'partycrm_statistics_not_allowed', 'Статистика недоступна на текущем тарифе компании', 'permission')
  }

  const PartyOrders = await getPartyOrderModel()
  const PartyServices = await getPartyServiceModel()
  const PartyClients = await getPartyClientModel()
  const PartyTransactions = await getPartyTransactionModel()
  const [orders, services, clients] = await Promise.all([
    PartyOrders.find({ tenantId: context.tenantId, status: { $ne: 'canceled' } }).sort({ eventDate: 1 }).lean(),
    PartyServices.find({ tenantId: context.tenantId }).sort({ title: 1 }).lean(),
    PartyClients.find({ tenantId: context.tenantId }).lean(),
  ])
  const orderIds = orders.map((item) => item._id)
  const transactions = orderIds.length
    ? await PartyTransactions.find({ tenantId: context.tenantId, orderId: { $in: orderIds } }).lean()
    : []
  const transactionsByOrder = transactions.reduce((map, item) => {
    const key = String(item.orderId)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
    return map
  }, new Map())

  return NextResponse.json({
    success: true,
    data: {
      orders: orders.map((order) => ({
        ...order,
        transactions: transactionsByOrder.get(String(order._id)) ?? order.transactions ?? [],
      })),
      services,
      clients,
    },
  })
}

export const dynamic = 'force-dynamic'
