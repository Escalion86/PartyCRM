const parseDateSafe = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const addDays = (date, days) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const isSameDay = (value, day) => {
  const date = parseDateSafe(value)
  if (!date) return false
  return startOfDay(date).getTime() === startOfDay(day).getTime()
}

const sortByAdditionalEventDate = (items) =>
  items.sort(
    (a, b) =>
      parseDateSafe(a.item.date).getTime() - parseDateSafe(b.item.date).getTime()
  )

export const collectPartyUpcomingAdditionalEvents = (orders, now) => {
  const today = startOfDay(now)
  const tomorrow = startOfDay(addDays(now, 1))
  const segments = {
    overdue: [],
    today: [],
    tomorrow: [],
    completedToday: [],
  }

  ;(Array.isArray(orders) ? orders : []).forEach((order) => {
    ;(Array.isArray(order.additionalEvents) ? order.additionalEvents : []).forEach(
      (item, index) => {
        const payload = { order, item, index }

        if (item?.done) {
          if (isSameDay(item?.doneAt, today)) segments.completedToday.push(payload)
          return
        }

        const date = parseDateSafe(item?.date)
        if (!date) return

        if (startOfDay(date).getTime() < today.getTime()) {
          segments.overdue.push(payload)
        } else if (isSameDay(date, today)) {
          segments.today.push(payload)
        } else if (isSameDay(date, tomorrow)) {
          segments.tomorrow.push(payload)
        }
      }
    )
  })

  sortByAdditionalEventDate(segments.overdue)
  sortByAdditionalEventDate(segments.today)
  sortByAdditionalEventDate(segments.tomorrow)
  segments.completedToday.sort(
    (a, b) =>
      (parseDateSafe(b.item.doneAt)?.getTime() ?? 0) -
      (parseDateSafe(a.item.doneAt)?.getTime() ?? 0)
  )

  return segments
}

export { addDays, parseDateSafe, startOfDay }
