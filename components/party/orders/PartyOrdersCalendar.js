'use client'

import { useMemo, useState } from 'react'
import {
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { DAYS_OF_WEEK } from '@helpers/constants'
import {
  buildPartyOrderCalendarGrid,
  buildPartyOrderCalendarItems,
  toPartyOrderCalendarMonthStart,
} from './partyOrderCalendarViewModel'

const getOrderToneClassName = (item) => {
  if (item.type === 'additional') {
    return item.done
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 line-through'
      : 'border-amber-200 bg-amber-50 text-amber-700'
  }

  if (item.status === 'canceled') {
    return 'border-red-200 bg-red-50 text-red-700'
  }
  if (item.status === 'closed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (item.status === 'draft') {
    return 'border-slate-200 bg-slate-100 text-slate-700'
  }
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

const formatMonthTitle = (value) =>
  value.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  })

const formatTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const findOrderById = (orders, id) =>
  orders.find((order) => String(order?._id) === String(id))

export default function PartyOrdersCalendar({
  orders = [],
  locations = [],
  onView,
}) {
  const [monthCursor, setMonthCursor] = useState(() =>
    toPartyOrderCalendarMonthStart(new Date())
  )

  const monthGridDays = useMemo(
    () => buildPartyOrderCalendarGrid(monthCursor),
    [monthCursor]
  )
  const { itemsByDay, meta: monthMeta } = useMemo(
    () => buildPartyOrderCalendarItems(orders),
    [orders]
  )
  const locationsById = useMemo(
    () => new Map(locations.map((location) => [String(location._id), location])),
    [locations]
  )

  const today = new Date()
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime()

  const openCalendarItem = (item) => {
    const order = findOrderById(orders, item.orderId)
    if (order) onView?.(order)
  }

  return (
    <div className="flex min-h-[520px] flex-col gap-3">
      <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-3">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-sky-200 bg-white text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() =>
                setMonthCursor((prev) =>
                  toPartyOrderCalendarMonthStart(
                    new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                  )
                )
              }
              title="Предыдущий месяц"
              aria-label="Предыдущий месяц"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="h-9 cursor-pointer rounded-md border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
              onClick={() =>
                setMonthCursor(toPartyOrderCalendarMonthStart(new Date()))
              }
            >
              Сегодня
            </button>
            <button
              type="button"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-sky-200 bg-white text-sky-700 transition hover:bg-sky-50"
              onClick={() =>
                setMonthCursor((prev) =>
                  toPartyOrderCalendarMonthStart(
                    new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                  )
                )
              }
              title="Следующий месяц"
              aria-label="Следующий месяц"
            >
              <FontAwesomeIcon icon={faChevronRight} className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
            <div className="text-sm font-semibold capitalize text-slate-800">
              {formatMonthTitle(monthCursor)}
            </div>
            <div className="text-xs text-slate-500">
              Заказов: {monthMeta.orders} | Доп. событий:{' '}
              {monthMeta.additional}
            </div>
          </div>
        </div>
      </div>

      <div className="event-month-calendar min-h-0 flex-1 overflow-auto rounded-lg border bg-white">
        <div className="event-month-calendar__weekdays sticky top-0 z-10 grid grid-cols-7 border-b shadow-sm backdrop-blur">
          {DAYS_OF_WEEK.map((dayName) => (
            <div
              key={dayName}
              className="px-1.5 py-1.5 text-center text-[11px] font-semibold"
            >
              {dayName}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-auto">
          {monthGridDays.map((day) => {
            const dayItems = itemsByDay.get(day.key) || []
            const hasDayContent = dayItems.length > 0
            const visibleDayItems = dayItems.slice(0, 2)
            const extraCount = dayItems.length - visibleDayItems.length
            const dayStart = new Date(
              day.date.getFullYear(),
              day.date.getMonth(),
              day.date.getDate()
            ).getTime()
            const isToday = dayStart === todayStart
            const isPastDay = dayStart < todayStart

            return (
              <div
                key={day.key}
                className={`event-month-calendar__day min-h-[72px] border-r border-b p-1 ${
                  day.inCurrentMonth
                    ? isPastDay
                      ? 'event-month-calendar__day--past'
                      : isToday
                        ? 'event-month-calendar__day--today'
                        : 'event-month-calendar__day--current'
                    : 'event-month-calendar__day--outside'
                } ${hasDayContent ? 'event-month-calendar__day--interactive' : ''}`}
              >
                <div
                  className={`event-month-calendar__day-number mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-semibold ${
                    isToday
                      ? 'event-month-calendar__day-number--today'
                      : day.inCurrentMonth
                        ? isPastDay
                          ? 'event-month-calendar__day-number--past'
                          : 'event-month-calendar__day-number--current'
                        : 'event-month-calendar__day-number--outside'
                  }`}
                >
                  {day.date.getDate()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {visibleDayItems.map((item, index) => {
                    const order = findOrderById(orders, item.orderId)
                    const location =
                      order?.locationId && locationsById.get(String(order.locationId))
                    const time = formatTime(item.startsAt)
                    const title = time ? `${time} ${item.title}` : item.title

                    return (
                      <button
                        key={`${day.key}-${item.type}-${item.orderId}-${index}`}
                        type="button"
                        className={`flex w-full cursor-pointer items-center gap-1 truncate rounded border px-1 py-0.5 text-left text-[10px] leading-tight ${getOrderToneClassName(item)}`}
                        title={
                          location?.title ? `${title} · ${location.title}` : title
                        }
                        onClick={() => openCalendarItem(item)}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            item.type === 'order'
                              ? 'bg-current'
                              : 'border border-current'
                          }`}
                        />
                        <span className="min-w-0 truncate">{title}</span>
                      </button>
                    )
                  })}
                  {extraCount > 0 ? (
                    <div className="px-1 text-[10px] leading-tight text-slate-500">
                      +{extraCount} еще
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
