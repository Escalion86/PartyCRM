'use client'

import { useEffect, useMemo, useRef } from 'react'
import { layoutPartyRoleCalendarDay } from '@helpers/partyRoleCalendar'

const hourHeight = 64
const time = (date) =>
  date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const fullDate = (date) =>
  date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
const label = (item) =>
  `${item.title}, ${fullDate(item.start)}${item.end ? ` — ${fullDate(item.end)}` : ', длительность не указана'}${item.clientName ? `, ${item.clientName}` : ''}`
const tones = {
  draft: 'border-slate-300 bg-slate-100/80',
  active: 'border-sky-400 bg-sky-100/80',
  canceled: 'border-red-300 bg-red-100/80',
  closed: 'border-emerald-400 bg-emerald-100/80',
}

export default function PartyRoleOrdersTimeGrid({
  days,
  byDay,
  onOpen,
  onChooseDay,
}) {
  const scroll = useRef(null)
  const periodKey = days.map((day) => day.key).join(':')
  const layouts = useMemo(
    () =>
      days.map((day) => ({
        ...day,
        ...layoutPartyRoleCalendarDay(byDay.get(day.key) || [], day.date),
      })),
    [days, byDay]
  )
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 8 * hourHeight
  }, [periodKey])
  const points = layouts.flatMap((day) =>
    day.points.map((item) => ({ ...item, dayKey: day.key }))
  )
  const widths = layouts.map((day) =>
    Math.max(
      days.length > 1 ? 130 : 198,
      ...day.intervals.map((item) => item.laneCount * 52)
    )
  )
  const gridTemplateColumns = `52px ${widths.map((width) => `minmax(${width}px, 1fr)`).join(' ')}`
  return (
    <div className="hidden min-w-0 space-y-3 md:block">
      {points.length > 0 ? (
        <div
          className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
          aria-label="События без длительности"
        >
          <p className="text-xs font-semibold text-slate-600">
            Указано только начало — длительность неизвестна
          </p>
          <div className="flex flex-wrap gap-2">
            {points.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item.id)}
                title={label(item)}
                className="min-h-11 max-w-full cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-left text-sm break-words text-sky-900"
              >
                {days.length > 1
                  ? `${fullDate(item.start)} · `
                  : `${time(item.start)} · `}
                {item.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div
        ref={scroll}
        className="max-h-[38rem] overflow-auto rounded-xl border border-slate-200 bg-white"
        aria-label="Почасовой календарь"
        tabIndex={0}
      >
        <div
          style={{
            minWidth: 52 + widths.reduce((sum, width) => sum + width, 0),
          }}
        >
          <div
            className="sticky top-0 z-20 grid border-b border-slate-200 bg-white"
            style={{ gridTemplateColumns }}
          >
            <div className="py-3 text-center text-xs text-slate-400">Часы</div>
            {days.map((day) => (
              <button
                key={day.key}
                type="button"
                onClick={() => onChooseDay(day.date)}
                className="min-h-11 min-w-0 cursor-pointer border-l border-slate-100 px-1 py-2 text-center text-sm font-semibold text-sky-900 hover:bg-sky-50"
                aria-label={`Открыть день ${day.date.toLocaleDateString('ru-RU')}`}
              >
                {day.date.toLocaleDateString('ru-RU', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </button>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns }}>
            <div
              className="relative bg-slate-50 text-xs text-slate-500"
              style={{ height: 24 * hourHeight }}
              aria-hidden="true"
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <span
                  key={hour}
                  className="absolute right-2"
                  style={{ top: hour * hourHeight + 2 }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {layouts.map((day) => (
              <div
                key={day.key}
                className="relative border-l border-slate-200"
                style={{
                  height: 24 * hourHeight,
                  backgroundImage:
                    'repeating-linear-gradient(to bottom, #e2e8f0 0px, #e2e8f0 1px, transparent 1px, transparent 64px)',
                }}
                aria-label={day.date.toLocaleDateString('ru-RU')}
              >
                {day.intervals.map((item) => {
                  const left = `${(item.lane * 100) / item.laneCount}%`
                  const width = `calc(${100 / item.laneCount}% - 3px)`
                  return (
                    <div key={item.id}>
                      <div
                        aria-hidden="true"
                        className={`pointer-events-none absolute rounded border-l-2 ${tones[item.status] || 'border-sky-300 bg-sky-50'}`}
                        style={{
                          left,
                          width,
                          top: (item.startMinute * hourHeight) / 60,
                          height: Math.max(
                            1,
                            ((item.endMinute - item.startMinute) * hourHeight) /
                              60
                          ),
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => onOpen(item.id)}
                        aria-label={label(item)}
                        title={label(item)}
                        className="absolute min-h-11 min-w-0 cursor-pointer overflow-hidden rounded px-1 py-1 text-left text-xs text-sky-950 hover:bg-white/90 focus-visible:z-10 focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-sky-600"
                        style={{
                          left,
                          width,
                          top: (item.labelStartMinute * hourHeight) / 60,
                          height: 44,
                        }}
                      >
                        <span className="block truncate font-semibold">
                          {item.title}
                        </span>
                        <span className="block truncate text-[10px]">
                          {item.continuesBefore ? '← ' : ''}
                          {time(item.start)} — {time(item.end)}
                          {item.continuesAfter ? ' →' : ''}
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Время показано в часовом поясе устройства. Полный список событий периода
        — ниже.
      </p>
    </div>
  )
}
