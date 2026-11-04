import {
  getPartyOrderModel,
  getPartyPaymentExpectationModel,
} from './partyModels'
import { buildPartyOrderAccessFilter } from '../helpers/partyRolePermissions.js'
import { canAccessPartyTransaction } from './partyTransactionAccess'
import {
  serializePartyPaymentExpectation,
  partyExpectationLabel,
} from '../helpers/partyPaymentExpectations.js'
import {
  projectPartyTodayOrder,
  PARTY_TODAY_SCAN_LIMIT,
  PARTY_TODAY_CARD_LIMIT,
} from '../helpers/partyToday.js'

export const loadPartyExpectedPaymentCards = async (context, period) => {
  const Expectations = await getPartyPaymentExpectationModel(),
    Orders = await getPartyOrderModel()
  const candidates = await Expectations.find({
    tenantId: context.tenantId,
    status: 'pending',
  })
    .sort({ dueAt: 1, _id: 1 })
    .limit(PARTY_TODAY_SCAN_LIMIT + 1)
    .lean()
  const rows = candidates.slice(0, PARTY_TODAY_SCAN_LIMIT)
  const ids = [...new Set(rows.map((row) => String(row.orderId)))]
  const orders = ids.length
    ? await Orders.find({
        $and: [
          buildPartyOrderAccessFilter(context),
          { _id: { $in: ids }, status: { $nin: ['closed', 'canceled'] } },
        ],
      })
        .select(
          '_id tenantId title serviceTitle status workflowStageId eventDate locationId assignedStaff responsibleStaffId client'
        )
        .lean()
    : []
  const byId = new Map(orders.map((order) => [String(order._id), order]))
  const cards = []
  for (const row of rows) {
    const order = byId.get(String(row.orderId))
    if (!order || !canAccessPartyTransaction(context, row, order)) continue
    const payment = serializePartyPaymentExpectation(row, period.now)
    if (payment.remaining <= 0) continue
    const reason = `${partyExpectationLabel(payment)}: ${payment.remaining.toLocaleString('ru-RU')} ₽${payment.paid ? ` · исполнено ${payment.paid.toLocaleString('ru-RU')} ₽` : ''}`
    const card = projectPartyTodayOrder(context, order, reason)
    if (card)
      cards.push({
        ...card,
        id: payment._id,
        dueAt: payment.dueAt,
        overdue: payment.overdue,
      })
  }
  return {
    items: cards.slice(0, PARTY_TODAY_CARD_LIMIT),
    hasMore: cards.length > PARTY_TODAY_CARD_LIMIT,
    partial: candidates.length > PARTY_TODAY_SCAN_LIMIT,
  }
}
