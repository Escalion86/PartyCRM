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
  const ticket = order.calendarEntityType === 'ticket_session'
  if (ticket && !access.tickets) return null
  const start = validDate(order.eventDate)
  if (!start) return null
  const end = ticket || access.end ? validDate(order.dateEnd) : null
  return {
    id: String(order._id),
    start,
    end: end && end >= start ? end : null,
    title:
      (ticket && `Сеанс: ${order.title || 'Билетная программа'}`) ||
      (access.title && order.title) ||
      (access.service && order.serviceTitle) ||
      'Заказ',
    clientName: !ticket && access.clientName ? order.client?.name || '' : '',
    status: ticket || access.status ? order.status || '' : '',
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

// Only known intervals occupy the time grid. A hidden or missing end is a
// point in time and is shown separately, without inventing a booking duration.
export const layoutPartyRoleCalendarDay = (items, date) => {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayEnd = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1
  )
  const minutes = (value) =>
    value.getHours() * 60 + value.getMinutes() + value.getSeconds() / 60
  const points = [],
    intervals = []
  for (const item of items) {
    if (!item.end || item.end <= item.start) {
      if (item.start >= dayStart && item.start < dayEnd) points.push(item)
      continue
    }
    if (item.end <= dayStart || item.start >= dayEnd) continue
    const startMinute = item.start <= dayStart ? 0 : minutes(item.start)
    const endMinute = item.end >= dayEnd ? 1440 : minutes(item.end)
    intervals.push({
      ...item,
      startMinute,
      endMinute,
      labelStartMinute: Math.min(startMinute, 1398),
      continuesBefore: item.start < dayStart,
      continuesAfter: item.end > dayEnd,
      // Reserve label space for a 44px button at 64px/hour. The actual interval
      // is drawn independently, so short events retain their true duration.
      labelEndMinute: Math.min(1440, Math.max(endMinute, startMinute + 42)),
    })
  }
  intervals.sort(
    (a, b) =>
      a.labelStartMinute - b.labelStartMinute ||
      b.endMinute - a.endMinute ||
      a.id.localeCompare(b.id)
  )
  let group = [],
    laneEnds = [],
    groupEnd = -1
  const finish = () => {
    for (const item of group) item.laneCount = laneEnds.length
    group = []
    laneEnds = []
    groupEnd = -1
  }
  for (const item of intervals) {
    if (group.length && item.labelStartMinute >= groupEnd) finish()
    let lane = laneEnds.findIndex((end) => end <= item.labelStartMinute)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = item.labelEndMinute
    item.lane = lane
    group.push(item)
    groupEnd = Math.max(groupEnd, item.labelEndMinute)
  }
  finish()
  return { points, intervals }
}
