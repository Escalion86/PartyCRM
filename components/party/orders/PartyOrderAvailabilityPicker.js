'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { partyDateInZone } from '@helpers/partyWorkingSchedule'

const button =
  'min-h-11 cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'
export default function PartyOrderAvailabilityPicker({
  companyId,
  orderId,
  placeType,
  locationId,
  durationMinutes,
  selectedStart,
  timeZone,
  disabled,
  refreshKey,
  onSelect,
}) {
  const [month, setMonth] = useState(() =>
    partyDateInZone(selectedStart || new Date(), timeZone).slice(0, 7)
  )
  const [day, setDay] = useState(() =>
    selectedStart ? partyDateInZone(selectedStart, timeZone) : ''
  )
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ key: '', data: null, error: '' })
  const key = JSON.stringify([
    companyId,
    orderId,
    month,
    placeType,
    locationId,
    durationMinutes,
    refreshKey,
    retry,
  ])
  const valid = Boolean(
    month &&
    Number.isSafeInteger(Number(durationMinutes)) &&
    Number(durationMinutes) > 0 &&
    (placeType === 'client_address' || locationId)
  )
  useEffect(() => {
    if (!valid) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const [year, monthNumber] = month.split('-').map(Number)
      const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
      apiJson('/api/party/orders/availability', {
        method: 'POST',
        headers: { 'x-partycrm-company-id': companyId },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({
          dateFrom: `${month}-01`,
          days,
          durationMinutes: Number(durationMinutes),
          placeType,
          locationId,
          ...(orderId ? { orderId } : {}),
        }),
      })
        .then((result) => {
          if (!controller.signal.aborted)
            setState({ key, data: result.data, error: '' })
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setState({
              key,
              data: null,
              error: cause.message || 'Не удалось проверить свободное время',
            })
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [
    companyId,
    orderId,
    month,
    placeType,
    locationId,
    durationMinutes,
    valid,
    key,
  ])
  const current = state.key === key
  const data = current ? state.data : null
  const selectedDay = data?.days?.find((entry) => entry.date === day)
  const time = (value) =>
    new Date(value).toLocaleTimeString('ru-RU', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    })
  const weekday = new Date(`${month}-01T12:00:00Z`).getUTCDay()
  const offset = (weekday + 6) % 7
  return (
    <div className="min-w-0 space-y-4">
      <label className="block text-sm">
        Месяц
        <input
          type="month"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          value={month}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value) {
              setMonth(event.target.value)
              setDay('')
            }
          }}
        />
      </label>
      {!valid ? (
        <p className="text-sm text-slate-600">
          Выберите место и длительность, чтобы увидеть доступное время.
        </p>
      ) : !current ? (
        <p role="status" className="text-sm text-slate-600">
          Проверка свободного времени…
        </p>
      ) : state.error ? (
        <div role="alert" className="text-sm text-red-800">
          <p>{state.error}</p>
          <button
            type="button"
            className={`${button} mt-2 border-sky-200 text-sky-800`}
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить проверку
          </button>
        </div>
      ) : !data?.configured ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
        >
          {data?.notice}
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-600">
            Свободные дни для всего интервала. Часовой пояс: {timeZone}.
          </p>
          <div
            className="grid grid-cols-7 gap-1"
            aria-label="Календарь свободных дней"
          >
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label) => (
              <span
                key={label}
                className="py-1 text-center text-xs text-slate-600"
              >
                {label}
              </span>
            ))}
            {Array.from({ length: offset }, (_, index) => (
              <span key={`empty-${index}`} />
            ))}
            {data.days.map((entry) => (
              <button
                key={entry.date}
                type="button"
                aria-label={`${entry.date}: ${entry.slots.length ? 'есть свободное время' : 'нет свободного времени'}`}
                aria-pressed={day === entry.date}
                disabled={disabled || !entry.slots.length}
                className={`${button} px-1 ${day === entry.date ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-200 bg-white text-sky-900'}`}
                onClick={() => setDay(entry.date)}
              >
                {Number(entry.date.slice(-2))}
              </button>
            ))}
          </div>
          {selectedDay ? (
            <section className="space-y-3" aria-label="Доступное время дня">
              <h3 className="text-sm font-semibold">
                {new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                })}
                : выберите интервал
              </h3>
              <div className="grid gap-2 sm:grid-cols-3">
                {selectedDay.slots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    className={`${button} ${selectedStart === slot.startsAt ? 'border-sky-700 bg-sky-700 text-white' : 'border-sky-200 text-sky-900 hover:bg-sky-50'}`}
                    aria-pressed={selectedStart === slot.startsAt}
                    disabled={disabled}
                    onClick={() => onSelect(slot)}
                  >
                    {time(slot.startsAt)} — {time(slot.endsAt)}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <p className="text-sm text-slate-600">
              Выберите день с доступным временем.
            </p>
          )}
        </>
      )}
      <p className="text-xs text-slate-600">
        Свободное время повторно проверяется при сохранении заказа.
      </p>
    </div>
  )
}
