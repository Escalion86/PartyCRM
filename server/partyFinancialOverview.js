import {
  canPartyAccess,
  buildPartyOrderAccessFilter,
} from '../helpers/partyRolePermissions'
import { isPartyTicketingEnabled } from '../helpers/partyTicketing'
import {
  calculatePartyFinancialOverview,
  parsePartyOverviewPeriod,
} from '../helpers/partyFinancialOverview'
import { getPartyOrderModel, getPartyTransactionModel } from './partyModels'
import {
  getPartyTicketSaleModel,
  getPartyTicketLedgerModel,
} from './partyTicketModels'
import { buildPartyTicketAccessFilter } from './partyTicketing'

export const getPartyFinancialOverview = async ({ context, from, to }) => {
  const can = (resource) => canPartyAccess(context, { resource })
  const orderRead = can('orders')
  const access = {
    orderPayments: orderRead && can('finance.payments'),
    orderRefunds: orderRead && can('finance.expenses'),
    orderEarned:
      orderRead && can('finance.clientAmount') && can('orders.fulfillment'),
    ticketFinance: can('tickets') && can('tickets.finance'),
  }
  access.orderUnmarked =
    access.orderEarned &&
    can('orders.eventDate') &&
    can('orders.dateEnd') &&
    can('orders.durationMinutes')
  if (!Object.values(access).some(Boolean))
    throw Object.assign(new Error('Нет доступа к финансовому обзору'), {
      status: 403,
    })
  const period = parsePartyOverviewPeriod({
    from,
    to,
    timeZone: context.company?.settings?.timeZone,
  })
  const orderFinance =
    access.orderPayments || access.orderRefunds || access.orderEarned
  const [Orders, Transactions] = orderFinance
    ? await Promise.all([getPartyOrderModel(), getPartyTransactionModel()])
    : []
  const orders = orderFinance
    ? await Orders.find(buildPartyOrderAccessFilter(context))
        .select(
          '_id tenantId status workflowStageId locationId assignedStaff.staffId responsibleStaffId serviceTitle eventDate dateEnd durationMinutes fulfillment transactions'
        )
        .lean()
    : []
  const orderIds = orders.map((order) => order._id)
  const [persistedOrderIds, transactions] = orderIds.length
    ? await Promise.all([
        Transactions.distinct('orderId', {
          tenantId: context.tenantId,
          orderId: { $in: orderIds },
        }),
        Transactions.find({
          tenantId: context.tenantId,
          orderId: { $in: orderIds },
          date: { $gte: period.dateFrom, $lt: period.dateTo },
        })
          .select('orderId amount type category date')
          .lean(),
      ])
    : [[], []]
  let sales = [],
    ticketLedger = []
  if (access.ticketFinance) {
    const Sales = await getPartyTicketSaleModel()
    sales = await Sales.find(buildPartyTicketAccessFilter(context))
      .select(
        '_id programId sessionId locationId admission quantity refundedQuantity totalAmountKopecks fulfilledAt earnedAmountKopecks createdAt'
      )
      .lean()
    access.ticketFinance =
      isPartyTicketingEnabled(context.company) || sales.length > 0
    if (sales.length) {
      const Ledger = await getPartyTicketLedgerModel()
      ticketLedger = await Ledger.find(
        buildPartyTicketAccessFilter(context, {
          saleId: { $in: sales.map((sale) => sale._id) },
        })
      )
        .select('saleId kind amountKopecks quantity occurredAt')
        .sort({ occurredAt: 1, _id: 1 })
        .lean()
    }
  }
  return {
    period: { from, to, timeZone: period.timeZone },
    access,
    ...calculatePartyFinancialOverview({
      period,
      orders,
      transactions,
      persistedOrderIds,
      sales,
      ticketLedger,
      access,
    }),
  }
}
