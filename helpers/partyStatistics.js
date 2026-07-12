const DAY_MS = 24 * 60 * 60 * 1000

export const getStatisticsPeriod = (preset, now = new Date()) => {
  const year = now.getFullYear()
  const month = now.getMonth()
  if (preset === 'year') return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59, 999) }
  if (preset === 'last_year') return { from: new Date(year - 1, 0, 1), to: new Date(year - 1, 11, 31, 23, 59, 59, 999) }
  if (preset === '30days') return { from: new Date(now.getTime() - 29 * DAY_MS), to: now }
  return { from: new Date(year, month, 1), to: new Date(year, month + 1, 0, 23, 59, 59, 999) }
}

const sumTransactions = (order, type) => (order.transactions ?? [])
  .filter((item) => item.type === type && !(type === 'expense' && item.category === 'payout'))
  .reduce((sum, item) => sum + Number(item.amount || 0), 0)

const payoutTotal = (order) => (order.assignedStaff ?? []).reduce(
  (sum, item) => sum + Number(item.payoutAmount || 0), 0
)

const getOrderValues = (order) => {
  const revenue = sumTransactions(order, 'income')
  const expenses = sumTransactions(order, 'expense')
  const payouts = payoutTotal(order)
  return { revenue, expenses, payouts, profit: revenue - expenses - payouts }
}

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export const buildPartyStatistics = ({ orders = [], services = [], clients = [], filters = {} }) => {
  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : null
  const filteredOrders = orders.filter((order) => {
    const date = order.eventDate ? new Date(order.eventDate) : null
    if (!date || Number.isNaN(date.getTime())) return false
    if (from && date < from) return false
    if (to && date > to) return false
    if (filters.status && filters.status !== 'all' && order.status !== filters.status) return false
    if (filters.placeType && filters.placeType !== 'all' && order.placeType !== filters.placeType) return false
    if (filters.serviceId && filters.serviceId !== 'all' && !(order.servicesIds ?? []).some((id) => String(id) === filters.serviceId)) return false
    return order.status !== 'canceled'
  })

  const servicesById = new Map(services.map((item) => [String(item._id), item]))
  const clientsById = new Map(clients.map((item) => [String(item._id), item]))
  const monthly = new Map()
  const byService = new Map()
  const byClient = new Map()
  const totals = { orders: 0, revenue: 0, expenses: 0, payouts: 0, profit: 0, clients: new Set() }

  filteredOrders.forEach((order) => {
    const values = getOrderValues(order)
    totals.orders += 1
    totals.revenue += values.revenue
    totals.expenses += values.expenses
    totals.payouts += values.payouts
    totals.profit += values.profit
    if (order.clientId) totals.clients.add(String(order.clientId))

    const key = monthKey(new Date(order.eventDate))
    const month = monthly.get(key) ?? { key, orders: 0, revenue: 0, profit: 0 }
    month.orders += 1
    month.revenue += values.revenue
    month.profit += values.profit
    monthly.set(key, month)

    const serviceIds = [...new Set((order.servicesIds ?? []).map(String))]
    const allocationIds = serviceIds.length ? serviceIds : ['unassigned']
    allocationIds.forEach((id) => {
      const item = byService.get(id) ?? { id, title: servicesById.get(id)?.title ?? 'Без услуги', orders: 0, revenue: 0, profit: 0 }
      item.orders += 1
      item.revenue += values.revenue / allocationIds.length
      item.profit += values.profit / allocationIds.length
      byService.set(id, item)
    })

    const clientId = order.clientId ? String(order.clientId) : 'unassigned'
    const client = clientsById.get(clientId)
    const item = byClient.get(clientId) ?? {
      id: clientId,
      title: client ? [client.firstName, client.secondName].filter(Boolean).join(' ') || client.phone || 'Без имени' : order.client?.name || 'Без клиента',
      orders: 0, revenue: 0, profit: 0,
    }
    item.orders += 1
    item.revenue += values.revenue
    item.profit += values.profit
    byClient.set(clientId, item)
  })

  return {
    orders: filteredOrders,
    totals: { ...totals, clients: totals.clients.size, averageOrder: totals.orders ? totals.revenue / totals.orders : 0, marginRate: totals.revenue ? totals.profit / totals.revenue * 100 : 0 },
    monthly: [...monthly.values()].sort((a, b) => a.key.localeCompare(b.key)),
    services: [...byService.values()].sort((a, b) => b.profit - a.profit),
    clients: [...byClient.values()].sort((a, b) => b.revenue - a.revenue),
  }
}
