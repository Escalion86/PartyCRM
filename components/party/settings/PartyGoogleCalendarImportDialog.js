'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Modal from '@components/Modal'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import { apiJson } from '@helpers/apiClient'

const endpoint = '/api/party/google-calendar/import'
const dayMs = 86400000
const maxPeriodDays = 366
const defaultBatchSize = 100
const buttonClass =
  'min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
const secondaryButton = `${buttonClass} border border-sky-200 bg-white text-sky-800 hover:bg-sky-50`
const primaryButton = `${buttonClass} bg-sky-700 text-white hover:bg-sky-800`
const inputClass =
  'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:bg-slate-50'
const eventStatuses = {
  already_imported: 'Уже импортировано',
  unavailable: 'Больше недоступно в календаре',
  unsupported_type: 'Этот тип событий не импортируется',
  invalid_dates: 'Проверьте даты в Google Calendar',
  save_failed: 'Заказ не удалось сохранить. Можно повторить импорт.',
}

const initialPeriod = (timeZone) => {
  const from = new Intl.DateTimeFormat('sv-SE', { timeZone }).format(new Date())
  const to = new Date(Date.parse(from) + 29 * dayMs).toISOString().slice(0, 10)
  return { from, to }
}

const allDayFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

const dateLabel = (event, formatter) => {
  if (event.allDay && event.startDay && event.endDay) {
    const start = new Date(event.startDay)
    const lastDay = new Date(Date.parse(event.endDay) - dayMs)
    if (Number.isFinite(+start) && lastDay >= start) {
      return allDayFormatter.formatRange(start, lastDay)
    }
  }
  const start = event.startsAt ? new Date(event.startsAt) : null
  const end = event.endsAt ? new Date(event.endsAt) : null
  if (!start || !Number.isFinite(+start)) return 'Дата не указана'
  return end && end > start
    ? formatter.formatRange(start, end)
    : formatter.format(start)
}

const available = (event) => event.eligible && !event.alreadyImported
const focus = (element) => element?.focus()

export default function PartyGoogleCalendarImportDialog({
  companyId,
  calendarName,
  companyTimeZone,
  onClose,
}) {
  const rangeHelpId = useId()
  const startInputRef = useRef(null)
  const actionRef = useRef(null)
  const [period, setPeriod] = useState(() => initialPeriod(companyTimeZone))
  const [preview, setPreview] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const importing = busy === 'import'

  usePartyUnsavedChanges(false, {
    label: 'импорт из Google Calendar',
    scope: companyId,
    pending: importing,
  })

  useEffect(
    () => () => {
      actionRef.current?.controller?.abort()
      actionRef.current = null
    },
    []
  )
  const events = useMemo(() => {
    if (!preview) return []
    const formatter = new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: preview.timeZone || companyTimeZone,
    })
    return preview.events.map((event) => ({
      ...event,
      date: dateLabel(event, formatter),
    }))
  }, [preview, companyTimeZone])
  const maxEvents = preview?.maxEvents || defaultBatchSize
  const availableEvents = events.filter(available)
  const batchIds = availableEvents.slice(0, maxEvents).map(({ id }) => id)
  const batchSelected =
    batchIds.length > 0 && batchIds.every((id) => selectedIds.has(id))
  const hasSaveFailures = result?.items.some(
    ({ reason }) => reason === 'save_failed'
  )
  const sourceName = preview?.calendarTitle || calendarName

  const resetPreview = () => {
    setPreview(null)
    setSelectedIds(new Set())
    setError('')
    setResult(null)
  }

  const changeDate = (key, value) => {
    setPeriod((current) => ({ ...current, [key]: value }))
    resetPreview()
  }

  const run = async (name, url, options, onSuccess, fallbackError) => {
    if (actionRef.current) return
    const controller = name === 'preview' ? new AbortController() : null
    const action = { name, controller }
    actionRef.current = action
    setBusy(name)
    setError('')
    setResult(null)
    try {
      const response = await apiJson(url, {
        ...options,
        ...(controller && { signal: controller.signal }),
        headers: { 'x-partycrm-company-id': companyId },
      })
      if (actionRef.current === action) onSuccess(response.data)
    } catch (cause) {
      if (actionRef.current === action) setError(cause.message || fallbackError)
    } finally {
      if (actionRef.current === action) {
        actionRef.current = null
        setBusy('')
      }
    }
  }

  const previewEvents = (event) => {
    event.preventDefault()
    if (actionRef.current) return
    const days = (Date.parse(period.to) - Date.parse(period.from)) / dayMs + 1
    if (!Number.isFinite(days) || days < 1 || days > maxPeriodDays) {
      setError(`Укажите период до ${maxPeriodDays} дней включительно.`)
      return
    }
    resetPreview()
    run(
      'preview',
      `${endpoint}?${new URLSearchParams(period)}`,
      {},
      (data) => {
        setPreview(data)
        setSelectedIds(
          new Set(
            data.events
              .filter(available)
              .slice(0, data.maxEvents || defaultBatchSize)
              .map(({ id }) => id)
          )
        )
      },
      'Не удалось получить события из Google Calendar'
    )
  }

  const importEvents = () => {
    if (!preview || !selectedIds.size) return
    run(
      'import',
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify({
          ...period,
          calendarId: preview.calendarId,
          eventIds: [...selectedIds],
        }),
      },
      (data) => {
        const processed = new Map(data.items.map((item) => [item.id, item]))
        setPreview((current) => ({
          ...current,
          events: current.events.map((event) => {
            const item = processed.get(event.id)
            return item
              ? {
                  ...event,
                  eligible: item.reason === 'save_failed',
                  alreadyImported:
                    item.status === 'imported' ||
                    item.reason === 'already_imported',
                  reason: item.reason,
                }
              : event
          }),
        }))
        setSelectedIds(
          new Set(
            data.items
              .filter(({ reason }) => reason === 'save_failed')
              .map(({ id }) => id)
          )
        )
        setResult(data)
      },
      'Не удалось импортировать заказы'
    )
  }

  const toggleEvent = (id) =>
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < maxEvents) next.add(id)
      return next
    })

  const close = () => {
    if (actionRef.current?.name !== 'import') onClose()
  }

  return (
    <Modal
      open
      onClose={close}
      title="Импорт заказов из Google Calendar"
      tone="party"
      size="2xl"
      initialFocusRef={startInputRef}
      disableBackdropClick={importing}
      footer={
        <>
          <button
            type="button"
            className={secondaryButton}
            onClick={close}
            disabled={importing}
          >
            Закрыть
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={importEvents}
            disabled={!selectedIds.size || busy === 'preview'}
            aria-disabled={importing || undefined}
          >
            {importing
              ? 'Импортируем…'
              : `Импортировать${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
          </button>
        </>
      }
    >
      <div className="grid gap-4 text-sm">
        {sourceName ? (
          <p className="wrap-anywhere text-slate-700">
            Календарь «{sourceName}»
          </p>
        ) : null}
        <p className="leading-6 text-slate-700">
          Новые заказы получат отметку «Не проверен». Связь с событиями Google
          сохранится. Синхронизация заказов будет выключена, чтобы сохранить
          настройки приглашений в Google.
        </p>
        <form className="grid gap-3" onSubmit={previewEvents}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1.5 font-medium text-slate-700">
              С даты
              <input
                ref={startInputRef}
                type="date"
                value={period.from}
                required
                max={period.to || undefined}
                disabled={Boolean(busy)}
                aria-describedby={rangeHelpId}
                className={inputClass}
                onChange={(event) => changeDate('from', event.target.value)}
              />
            </label>
            <label className="grid min-w-0 gap-1.5 font-medium text-slate-700">
              По дату
              <input
                type="date"
                value={period.to}
                required
                min={period.from || undefined}
                disabled={Boolean(busy)}
                aria-describedby={rangeHelpId}
                className={inputClass}
                onChange={(event) => changeDate('to', event.target.value)}
              />
            </label>
          </div>
          <p id={rangeHelpId} className="text-xs leading-5 text-slate-600">
            До {maxPeriodDays} дней с учётом обеих дат. Часовой пояс компании{' '}
            {preview?.timeZone || companyTimeZone}.
          </p>
          <button
            type="submit"
            className={`${secondaryButton} justify-self-start`}
            aria-disabled={busy === 'preview' || undefined}
            disabled={importing}
          >
            {busy === 'preview' ? 'Ищем события…' : 'Найти события'}
          </button>
        </form>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            {error}
          </p>
        ) : null}
        {result ? (
          <p
            ref={focus}
            tabIndex={-1}
            role="status"
            className={`rounded-lg p-3 ${
              hasSaveFailures
                ? 'bg-amber-50 text-amber-900'
                : 'bg-emerald-50 text-emerald-900'
            }`}
          >
            Импорт завершён. Создано заказов {result.imported}. Пропущено{' '}
            {result.skipped}.
            {hasSaveFailures ? ' Повторите импорт выбранных событий.' : ''}
          </p>
        ) : null}
        {preview ? (
          <section className="grid gap-3 border-t border-slate-200 pt-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3
                  ref={focus}
                  tabIndex={-1}
                  className="font-semibold text-slate-900"
                >
                  События за выбранный период ({events.length})
                </h3>
                {events.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-600">
                    {availableEvents.length > 0
                      ? `Выбрано ${selectedIds.size}.`
                      : 'Все события уже обработаны или недоступны.'}
                    {availableEvents.length > maxEvents
                      ? ` До ${maxEvents} событий за один импорт.`
                      : ''}
                  </p>
                ) : null}
              </div>
              {batchIds.length > 0 ? (
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={importing}
                  onClick={() =>
                    setSelectedIds(
                      batchSelected ? new Set() : new Set(batchIds)
                    )
                  }
                >
                  {batchSelected
                    ? 'Снять выбор'
                    : availableEvents.length > maxEvents
                      ? `Выбрать первые ${maxEvents}`
                      : 'Выбрать все'}
                </button>
              ) : null}
            </div>
            {events.length === 0 ? (
              <p className="text-slate-600">За выбранный период событий нет.</p>
            ) : (
              <ul className="grid gap-2">
                {events.map((event) => {
                  const canSelect = available(event)
                  const status = event.alreadyImported
                    ? eventStatuses.already_imported
                    : eventStatuses[event.reason] || 'Недоступно для импорта'
                  const disabled =
                    !canSelect ||
                    importing ||
                    (selectedIds.size >= maxEvents &&
                      !selectedIds.has(event.id))
                  return (
                    <li key={event.id}>
                      <label
                        className={`flex min-w-0 gap-3 rounded-lg border px-3 py-2.5 ${
                          disabled
                            ? 'cursor-not-allowed border-slate-200 bg-slate-50'
                            : 'cursor-pointer border-sky-100 bg-white hover:border-sky-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(event.id)}
                          disabled={disabled}
                          onChange={() => toggleEvent(event.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-sky-700 disabled:cursor-not-allowed"
                        />
                        <span className="grid min-w-0 gap-1">
                          <span className="font-medium wrap-anywhere text-slate-900">
                            {event.title}
                          </span>
                          <span className="text-xs leading-5 wrap-anywhere text-slate-600">
                            {event.date}
                            {event.allDay ? ' · Весь день' : ''}
                            {event.location ? ` · ${event.location}` : ''}
                          </span>
                          {!canSelect || event.reason === 'save_failed' ? (
                            <span className="text-xs font-medium text-slate-700">
                              {status}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </Modal>
  )
}
