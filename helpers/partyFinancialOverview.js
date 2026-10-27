import { zonedMidnight } from './partyFinancialSettlements.js'

const fail = (message) => {
  throw Object.assign(new Error(message), {
    status: 400,
    code: 'partycrm_finance_period_invalid',
  })
}
const dateParts = (text) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text || '')) fail('Укажите даты периода')
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.toISOString().slice(0, 10) !== text)
    fail('Укажите существующую дату')
  return { year, month, day }
}
export const parsePartyOverviewPeriod = ({
  from,
  to,
  timeZone = 'Asia/Krasnoyarsk',
}) => {
  const start = dateParts(from),
    end = dateParts(to)
  const dateFrom = zonedMidnight(start.year, start.month, start.day, timeZone)
  const nextDay = new Date(Date.UTC(end.year, end.month - 1, end.day + 1))
  const dateTo = zonedMidnight(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    timeZone
  )
  if (+dateTo <= +dateFrom || +dateTo - +dateFrom > 367 * 86400000)
    fail('Выберите период не более года')
  return { from, to, dateFrom, dateTo, timeZone }
}
export const overviewContainsDate = (range, value) =>
  value &&
  Number.isFinite(+new Date(value)) &&
  +new Date(value) >= +range.dateFrom &&
  +new Date(value) < +range.dateTo
export const moneyToKopecks = (value) => Math.round(Number(value || 0) * 100)

// Reports use immutable facts and their own dates. A receipt is never earned a
// second time when the event is performed; a completed event may still be unpaid.
export const calculatePartyFinancialOverview = ({
  period,
  orders = [],
  transactions = [],
  persistedOrderIds,
  sales = [],
  ticketLedger = [],
  access,
}) => {
  const byOrder = new Map(orders.map((order) => [String(order._id), order]))
  const persisted = new Set(
    (persistedOrderIds || transactions.map((row) => row.orderId)).map(String)
  )
  const receipts = [
    ...transactions,
    ...orders
      .filter((order) => !persisted.has(String(order._id)))
      .flatMap((order) =>
        (order.transactions || []).map((row) => ({
          ...row,
          orderId: order._id,
        }))
      ),
  ]
  let orderPayments = 0,
    orderRefunds = 0,
    orderEarned = 0,
    unmarkedPastOrders = 0
  for (const row of receipts) {
    if (
      !byOrder.has(String(row.orderId)) ||
      !overviewContainsDate(period, row.date)
    )
      continue
    if (row.type === 'income' && access.orderPayments)
      orderPayments += moneyToKopecks(row.amount)
    if (
      row.type === 'expense' &&
      row.category === 'refund' &&
      access.orderRefunds
    )
      orderRefunds += moneyToKopecks(row.amount)
  }
  for (const order of orders) {
    if (
      access.orderEarned &&
      overviewContainsDate(period, order.fulfillment?.performedAt)
    )
      orderEarned += Number(order.fulfillment.amountKopecks || 0)
    if (
      access.orderUnmarked &&
      !order.fulfillment?.performedAt &&
      order.status !== 'canceled' &&
      overviewContainsDate(period, order.eventDate) &&
      (order.dateEnd
        ? +new Date(order.dateEnd)
        : +new Date(order.eventDate) +
          (Number(order.durationMinutes) || 60) * 60000) <= Date.now()
    )
      unmarkedPastOrders += 1
  }
  const bySale = new Map(sales.map((sale) => [String(sale._id), sale]))
  let ticketPayments = 0,
    ticketRefunds = 0,
    ticketEarned = 0,
    ticketQuantity = 0,
    refundedTicketQuantity = 0
  for (const row of ticketLedger) {
    const sale = bySale.get(String(row.saleId))
    if (!sale || !access.ticketFinance) continue
    if (overviewContainsDate(period, row.occurredAt)) {
      if (row.kind === 'payment')
        ticketPayments += Number(row.amountKopecks || 0)
      if (row.kind === 'refund') {
        ticketRefunds += Number(row.amountKopecks || 0)
        refundedTicketQuantity += Number(row.quantity || 0)
      }
      // Open admission earns its allocated, discounted value on actual entry.
      if (row.kind === 'admission' && sale.admission === 'open') {
        ticketEarned += Number(row.amountKopecks || 0)
      }
    }
  }
  for (const sale of sales) {
    if (!access.ticketFinance) continue
    if (overviewContainsDate(period, sale.createdAt))
      ticketQuantity += sale.quantity
    if (
      sale.admission === 'session' &&
      overviewContainsDate(period, sale.fulfilledAt)
    )
      ticketEarned += Number(sale.earnedAmountKopecks || 0)
  }
  return {
    orderPaymentsKopecks: access.orderPayments ? orderPayments : null,
    orderRefundsKopecks: access.orderRefunds ? orderRefunds : null,
    orderEarnedKopecks: access.orderEarned ? orderEarned : null,
    ticketPaymentsKopecks: access.ticketFinance ? ticketPayments : null,
    ticketRefundsKopecks: access.ticketFinance ? ticketRefunds : null,
    ticketEarnedKopecks: access.ticketFinance ? ticketEarned : null,
    ticketQuantity: access.ticketFinance ? ticketQuantity : null,
    refundedTicketQuantity: access.ticketFinance
      ? refundedTicketQuantity
      : null,
    unmarkedPastOrders: access.orderUnmarked ? unmarkedPastOrders : null,
    // Provider settlements require a confirmed provider feed. Unknown is not 0.
    aggregatorSettlementsKopecks: null,
    aggregatorExpectedKopecks: null,
  }
}
