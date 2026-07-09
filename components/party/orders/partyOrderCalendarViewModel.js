export const toPartyOrderCalendarMonthStart = (value = new Date()) =>
  new Date(value.getFullYear(), value.getMonth(), 1)

export const toPartyOrderCalendarDateKey = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toMinuteOfDay = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return date.getHours() * 60 + date.getMinutes()
}

const idOf = (value) => String(value?._id || value?.id || '')

export const buildPartyOrderCalendarGrid = (monthCursor = new Date()) => {
  const monthStart = toPartyOrderCalendarMonthStart(monthCursor)
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const firstDay = new Date(year, month, 1)
  const gridStart = new Date(year, month, 1 - firstDay.getDay())
  const lastDay = new Date(year, month + 1, 0)
  const gridEnd = new Date(
    year,
    month,
    lastDay.getDate() + (6 - lastDay.getDay())
  )
  const diffMs = gridEnd.getTime() - gridStart.getTime()
  const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1
  const gridSize = Math.ceil(totalDays / 7) * 7

  return Array.from({ length: gridSize }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index
    )
    return {
      date,
      key: toPartyOrderCalendarDateKey(date),
      inCurrentMonth: date.getMonth() === month,
    }
  })
}

export const buildPartyOrderCalendarItems = (orders = []) => {
  const itemsByDay = new Map()
  const meta = { orders: 0, additional: 0 }

  const addItem = (key, item) => {
    if (!key) return
    if (!itemsByDay.has(key)) itemsByDay.set(key, [])
    itemsByDay.get(key).push(item)
  }

  orders.forEach((order) => {
    const orderId = idOf(order)
    if (order?.eventDate) {
      meta.orders += 1
      addItem(toPartyOrderCalendarDateKey(order.eventDate), {
        type: 'order',
        orderId,
        title: order.title || order.serviceTitle || 'Заказ',
        status: order.status || 'draft',
        startsAt: order.eventDate,
      })
    }

    ;(Array.isArray(order?.additionalEvents)
      ? order.additionalEvents
      : []
    ).forEach((item, index) => {
      if (!item?.date) return
      meta.additional += 1
      addItem(toPartyOrderCalendarDateKey(item.date), {
        type: 'additional',
        orderId,
        title: item.title || 'Задача',
        status: order.status || 'draft',
        startsAt: item.date,
        done: Boolean(item.done),
        itemIndex: index,
      })
    })
  })

  itemsByDay.forEach((items) => {
    items.sort((first, second) => {
      const timeDiff = toMinuteOfDay(first.startsAt) - toMinuteOfDay(second.startsAt)
      if (timeDiff !== 0) return timeDiff
      if (first.type !== second.type) return first.type === 'order' ? -1 : 1
      return first.title.localeCompare(second.title, 'ru')
    })
  })

  return { itemsByDay, meta }
}
