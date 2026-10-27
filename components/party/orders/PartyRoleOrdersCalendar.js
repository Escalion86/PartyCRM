'use client'

import { useId, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
import { buildPartyRoleCalendarDays } from '@helpers/partyRoleCalendar'
import {
  buildPartyOrderCalendarGrid,
  toPartyOrderCalendarDateKey,
  toPartyOrderCalendarMonthStart,
} from './partyOrderCalendarViewModel'

const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const time = (value) =>
  value.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const statusNames = {
  draft: 'Заявка',
  active: 'Подтверждён',
  canceled: 'Отменён',
  closed: 'Закрыт',
}
const tones = {
  draft: 'border-slate-200 bg-slate-50',
  active: 'border-sky-200 bg-sky-50',
  canceled: 'border-red-200 bg-red-50',
  closed: 'border-emerald-200 bg-emerald-50',
}

export default function PartyRoleOrdersCalendar({
  orders,
  month,
  onMonthChange,
  access,
  onOpen,
  busy,
  error,
  onReload,
  undatedCount = 0,
  onOpenUndated,
}) {
  const [selectedDay, setSelectedDay] = useState('')
  const calendarId = useId()
  const days = useMemo(() => buildPartyOrderCalendarGrid(month), [month])
  const byDay = useMemo(
    () => buildPartyRoleCalendarDays(orders, days, access),
    [orders, days, access]
  )
  const todayKey = toPartyOrderCalendarDateKey(new Date())
  const activeKey = days.some((day) => day.key === selectedDay)
    ? selectedDay
    : days.some((day) => day.key === todayKey && day.inCurrentMonth)
      ? todayKey
      : days.find((day) => day.inCurrentMonth && byDay.get(day.key).length)
          ?.key || days.find((day) => day.inCurrentMonth)?.key
  const activeDay = days.find((day) => day.key === activeKey)
  const activeItems = byDay.get(activeKey) || []
  const orderMap = new Map(orders.map((order) => [String(order._id), order]))
  const monthCount = new Set(
    days
      .filter((day) => day.inCurrentMonth)
      .flatMap((day) => byDay.get(day.key).map((item) => item.id))
  ).size
  const changeMonth = (next) => {
    setSelectedDay('')
    onMonthChange(toPartyOrderCalendarMonthStart(next))
  }
  return (
    <section
      aria-label="Календарь заказов"
      aria-busy={busy}
      className="min-w-0 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={button}
            aria-label="Предыдущий месяц"
            onClick={() =>
              changeMonth(
                new Date(month.getFullYear(), month.getMonth() - 1, 1)
              )
            }
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            type="button"
            className={button}
            onClick={() => changeMonth(new Date())}
          >
            Сегодня
          </button>
          <button
            type="button"
            className={button}
            aria-label="Следующий месяц"
            onClick={() =>
              changeMonth(
                new Date(month.getFullYear(), month.getMonth() + 1, 1)
              )
            }
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
        <p className="font-semibold text-sky-950 capitalize" aria-live="polite">
          {month.toLocaleDateString('ru-RU', {
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>
          {busy
            ? 'Загрузка заказов месяца…'
            : `Заказов в месяце: ${monthCount}`}
        </span>
        {undatedCount > 0 && (
          <button
            type="button"
            className="min-h-10 cursor-pointer text-sky-700 underline underline-offset-2"
            onClick={onOpenUndated}
          >
            Без даты в списке: {undatedCount}
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}{' '}
          <button
            type="button"
            className="min-h-10 cursor-pointer underline"
            onClick={onReload}
          >
            Повторить
          </button>
        </p>
      )}
      <div className="event-month-calendar overflow-hidden rounded-xl border bg-white">
        <div className="event-month-calendar__weekdays grid grid-cols-7 border-b">
          {['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'].map((day) => (
            <div key={day} className="py-2 text-center text-xs font-semibold">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const items = byDay.get(day.key)
            return (
              <button
                type="button"
                key={day.key}
                id={`${calendarId}-${day.key}`}
                tabIndex={day.key === activeKey ? 0 : -1}
                aria-label={`${day.date.toLocaleDateString('ru-RU')}, заказов: ${items.length}`}
                aria-pressed={day.key === activeKey}
                onClick={() => setSelectedDay(day.key)}
                onKeyDown={(event) => {
                  const delta = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -7,
                    ArrowDown: 7,
                  }[event.key]
                  const target = delta
                    ? Math.max(0, Math.min(days.length - 1, index + delta))
                    : event.key === 'Home'
                      ? index - (index % 7)
                      : event.key === 'End'
                        ? Math.min(days.length - 1, index + 6 - (index % 7))
                        : null
                  if (target === null) return
                  event.preventDefault()
                  setSelectedDay(days[target].key)
                  requestAnimationFrame(() =>
                    document
                      .getElementById(`${calendarId}-${days[target].key}`)
                      ?.focus()
                  )
                }}
                className={`event-month-calendar__day flex min-h-14 min-w-0 cursor-pointer flex-col items-center gap-1 border-r border-b px-1 py-2 text-sm focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-sky-600 sm:min-h-20 ${day.inCurrentMonth ? 'event-month-calendar__day--current' : 'event-month-calendar__day--outside text-slate-400'} ${day.key === activeKey ? 'ring-2 ring-sky-500 ring-inset' : ''}`}
              >
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full ${day.key === todayKey ? 'bg-sky-700 font-bold text-white' : ''}`}
                >
                  {day.date.getDate()}
                </span>
                {items.length > 0 && (
                  <span className="rounded-full bg-sky-100 px-2 text-xs font-semibold text-sky-800">
                    {items.length}
                  </span>
                )}
                {items.slice(0, 2).map((item) => (
                  <span
                    key={item.id}
                    aria-hidden="true"
                    title={`${time(item.start)} ${item.title}`}
                    className="hidden w-full min-w-0 truncate rounded bg-sky-50 px-1 text-[10px] font-medium text-sky-900 sm:block"
                  >
                    {time(item.start)} {item.title}
                  </span>
                ))}
              </button>
            )
          })}
        </div>
      </div>
      <div className="space-y-2" aria-label="Заказы выбранного дня">
        <h3 className="text-sm font-semibold text-slate-700">
          {activeDay?.date.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </h3>
        {!busy && !error && !activeItems.length && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
            На этот день заказов по выбранным условиям нет.
          </p>
        )}
        {activeItems.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`min-h-11 w-full cursor-pointer space-y-1 rounded-xl border p-3 text-left transition hover:border-sky-400 ${tones[item.status] || 'border-sky-100 bg-white'}`}
            onClick={() => onOpen(orderMap.get(item.id))}
          >
            <p className="font-semibold break-words text-sky-950">
              {item.title}
            </p>
            <p className="text-sm text-slate-600">
              {toPartyOrderCalendarDateKey(item.start) === activeKey
                ? time(item.start)
                : item.start.toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
              {item.end
                ? ` — ${item.end.toDateString() === item.start.toDateString() ? time(item.end) : item.end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                : ''}
              {item.status ? ` · ${statusNames[item.status] || ''}` : ''}
            </p>
            {item.clientName && (
              <p className="text-sm break-words text-slate-600">
                {item.clientName}
              </p>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
