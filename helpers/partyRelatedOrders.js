import { getOrderPaymentState } from './partyOrderTransactions.js'

const idOf = (value) => String(value?._id ?? value ?? '').trim()
const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : [])
const sameTenant = (left, right) =>
  Boolean(idOf(left.tenantId)) && idOf(left.tenantId) === idOf(right.tenantId)

const uniqueById = (items, allowMissing = false) => {
  const seen = new Set()
  return list(items).filter((item) => {
    const id = idOf(item._id ?? item.id)
    if (!id) return allowMissing
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

// Matches the order ledger: refunds are expenses and do not reopen balanceDue.
// A summary never moves payments between orders or combines persisted and legacy ledgers.
export const buildPartyRelatedOrdersSummary = ({
  orders = [],
  transactions = [],
  clients = [],
  locations = [],
} = {}) => {
  const rows = uniqueById(orders).map((order) => {
    const persisted = list(transactions).filter(
      (transaction) =>
        idOf(transaction.orderId) === idOf(order._id) &&
        sameTenant(transaction, order)
    )
    const ledger = uniqueById(
      persisted.length ? persisted : order.transactions,
      true
    )
    const { contractAmount, incomeTotal, expenseTotal, balanceDue } =
      getOrderPaymentState({
        contractAmount: order.contractAmount,
        transactions: ledger,
      })
    const payer = list(clients).find(
      (client) =>
        idOf(client._id) === idOf(order.contactRoles?.payerClientId) &&
        sameTenant(client, order)
    )
    const location = list(locations).find(
      (item) =>
        idOf(item._id) === idOf(order.locationId) && sameTenant(item, order)
    )
    return {
      _id: idOf(order._id),
      title: order.title || '',
      eventDate: order.eventDate || null,
      status: order.status || '',
      locationTitle: location?.title || '',
      payerName: payer
        ? [payer.secondName, payer.firstName, payer.thirdName]
            .filter(Boolean)
            .join(' ') || 'Не указан'
        : 'Не указан',
      finance: { contractAmount, incomeTotal, expenseTotal, balanceDue },
    }
  })
  const totals = rows.reduce(
    (total, row) => ({
      contractAmount:
        total.contractAmount +
        (row.status === 'canceled' ? 0 : row.finance.contractAmount),
      incomeTotal: total.incomeTotal + row.finance.incomeTotal,
      expenseTotal: total.expenseTotal + row.finance.expenseTotal,
      balanceDue:
        total.balanceDue +
        (row.status === 'canceled' ? 0 : row.finance.balanceDue),
    }),
    { contractAmount: 0, incomeTotal: 0, expenseTotal: 0, balanceDue: 0 }
  )
  return { orders: rows, totals }
}
