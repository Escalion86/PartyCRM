'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const primaryButtonClass =
  'px-4 py-2 text-sm font-semibold text-white transition-colors rounded-md cursor-pointer bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60'

const secondaryButtonClass =
  'px-4 py-2 text-sm font-semibold transition-colors bg-white border rounded-md cursor-pointer text-sky-700 border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60'

export default function PerformerGoogleCalendarSettings() {
  const [status, setStatus] = useState(null)
  const [calendars, setCalendars] = useState([])
  const [calendarId, setCalendarId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [syncResult, setSyncResult] = useState(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiJson(
        '/api/party/performer/google-calendar/status',
        { cache: 'no-store' }
      )
      setStatus(response.data ?? null)
      setCalendarId(response.data?.calendarId || '')
    } catch (loadError) {
      setError(loadError.message || 'Не удалось загрузить Google Calendar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthStatus = params.get('googleCalendar')
    if (!oauthStatus) return
    setMessage(oauthStatus === 'connected' ? 'Google-аккаунт подключён.' : '')
    setError(
      oauthStatus === 'connected' ? '' : 'Не удалось подключить Google Calendar'
    )
    params.delete('googleCalendar')
    params.delete('error')
    const query = params.toString()
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    )
    loadStatus()
  }, [loadStatus])

  const run = async (name, action) => {
    setBusy(name)
    setMessage('')
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(actionError.message || 'Не удалось выполнить действие')
    } finally {
      setBusy('')
    }
  }

  const connect = () =>
    run('connect', async () => {
      const response = await apiJson(
        '/api/party/performer/google-calendar/auth-url',
        { cache: 'no-store' }
      )
      window.location.assign(response.data.url)
    })

  const loadCalendars = () =>
    run('calendars', async () => {
      const response = await apiJson(
        '/api/party/performer/google-calendar/calendars',
        { cache: 'no-store' }
      )
      setCalendars(response.data?.calendars || [])
      setMessage('Список календарей обновлён.')
    })

  const selectCalendar = () =>
    run('select', async () => {
      await apiJson('/api/party/performer/google-calendar/select', {
        method: 'POST',
        body: JSON.stringify({ calendarId }),
      })
      await loadStatus()
      setMessage('Календарь выбран.')
    })

  const toggleEnabled = (enabled) =>
    run('enabled', async () => {
      await apiJson('/api/party/performer/google-calendar/settings', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      })
      await loadStatus()
      setMessage(enabled ? 'Синхронизация включена.' : 'Синхронизация выключена.')
    })

  const disconnect = () =>
    run('disconnect', async () => {
      await apiJson('/api/party/performer/google-calendar/disconnect', {
        method: 'POST',
      })
      setCalendars([])
      await loadStatus()
      setMessage('Google Calendar отключён.')
    })

  const syncFuture = () =>
    run('sync', async () => {
      const response = await apiJson(
        '/api/party/performer/google-calendar/sync-future',
        { method: 'POST' }
      )
      setSyncResult(response.data)
      setMessage('Синхронизация будущих подтверждённых заказов завершена.')
    })

  const connected = status?.connected === true
  const actionsDisabled = loading || Boolean(busy)

  if (loading && !status) {
    return (
      <div className="rounded-lg border border-sky-100 bg-white p-4 text-sm text-slate-500">
        Проверяем Google Calendar...
      </div>
    )
  }

  return (
    <section className="grid gap-4 rounded-lg border border-sky-100 bg-white p-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Google Calendar</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          В личный календарь попадают только заказы, где вы подтвердили участие.
          Финансы компании, внутренняя смета и служебные заметки не передаются.
        </p>
      </div>
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {!connected ? (
        <button
          type="button"
          onClick={connect}
          disabled={actionsDisabled}
          className={primaryButtonClass}
        >
          {busy === 'connect' ? 'Подключаем...' : 'Подключить Google Calendar'}
        </button>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <span className="font-semibold text-slate-800">Аккаунт:</span>{' '}
              {status.email || 'не указан'}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Календарь:</span>{' '}
              {status.calendarName || 'не выбран'}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase text-slate-500">
                Календарь Google
              </span>
              <select
                value={calendarId}
                onChange={(event) => setCalendarId(event.target.value)}
                className="h-11 cursor-pointer rounded-md border border-sky-100 bg-white px-3 text-sm"
              >
                <option value="">{status.calendarName || 'Выберите календарь'}</option>
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name || calendar.summary || calendar.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={loadCalendars}
                disabled={actionsDisabled}
                className={secondaryButtonClass}
              >
                Обновить список
              </button>
              <button
                type="button"
                onClick={selectCalendar}
                disabled={actionsDisabled || !calendarId}
                className={primaryButtonClass}
              >
                Выбрать
              </button>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={status.enabled === true}
              disabled={actionsDisabled || !status.calendarId}
              onChange={(event) => toggleEnabled(event.target.checked)}
            />
            Синхронизировать подтверждённые заказы с Google Calendar
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={connect}
              disabled={actionsDisabled}
              className={secondaryButtonClass}
            >
              Переподключить
            </button>
            <button
              type="button"
              onClick={syncFuture}
              disabled={actionsDisabled || !status.enabled || !status.calendarId}
              className={primaryButtonClass}
            >
              {busy === 'sync' ? 'Синхронизируем...' : 'Синхронизировать будущие'}
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={actionsDisabled}
              className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Отключить
            </button>
          </div>
          {syncResult ? (
            <div className="grid gap-1 rounded-md border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-3">
              <span>Обработано: {syncResult.processed || 0}</span>
              <span>Синхронизировано: {syncResult.synced || 0}</span>
              <span>Пропущено: {syncResult.skipped || 0}</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
