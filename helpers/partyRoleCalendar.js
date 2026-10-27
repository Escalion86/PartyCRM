import { toPartyOrderCalendarDateKey } from '../components/party/orders/partyOrderCalendarViewModel.js'

const validDate = (value) =>
  value && Number.isFinite(+new Date(value)) ? new Date(value) : null

export const getPartyRoleCalendarRange = (days) => {
  const first = days[0]?.date
  const last = days.at(-1)?.date
  if (!first || !last) return null
  return {
    dateFrom: first.toISOString(),
    dateTo: new Date(
      last.getFullYear(),
      last.getMonth(),
      last.getDate() + 1
    ).toISOString(),
  }
}

// Calendar labels are an explicit projection, including when a test/API fixture
// accidentally carries metadata that the current position cannot read.
export const projectPartyRoleCalendarOrder = (order, access = {}) => {
  const start = validDate(order.eventDate)
  if (!start) return null
  const end = access.end ? validDate(order.dateEnd) : null
  return {
    id: String(order._id),
    start,
    end: end && end >= start ? end : null,
    title:
      (access.title && order.title) ||
      (access.service && order.serviceTitle) ||
      'Заказ',
    clientName: access.clientName ? order.client?.name || '' : '',
    status: access.status ? order.status || '' : '',
  }
}

export const buildPartyRoleCalendarDays = (orders, days, access = {}) => {
  const result = new Map(days.map((day) => [day.key, []]))
  for (const order of orders) {
    const item = projectPartyRoleCalendarOrder(order, access)
    if (!item) continue
    const firstKey = toPartyOrderCalendarDateKey(item.start)
    const lastKey = toPartyOrderCalendarDateKey(
      item.end && item.end > item.start ? new Date(+item.end - 1) : item.start
    )
    for (const day of days) {
      if (day.key >= firstKey && day.key <= lastKey)
        result.get(day.key).push(item)
    }
  }
  for (const items of result.values())
    items.sort(
      (a, b) =>
        +a.start - +b.start ||
        a.title.localeCompare(b.title, 'ru', { numeric: true })
    )
  return result
}
