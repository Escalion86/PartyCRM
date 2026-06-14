'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import {
  getNextCalendarDraftState,
  getNextSyncCursor,
} from './PartyGoogleCalendarSettingsState'

const TITLE_MODES = [
  ['eventType_services', 'Название заказа + услуги'],
  ['services_eventType', 'Услуги + название заказа'],
  ['eventType', 'Только название заказа'],
  ['services', 'Только услуги'],
  ['client_eventType', 'Клиент + название заказа'],
]

const SYNC_FIELDS = [
  ['showDescription', 'Описание и комментарий'],
  ['showClient', 'Клиент и контакты'],
  ['showLocation', 'Адрес и место проведения'],
  ['showServices', 'Услуги'],
  ['showStaff', 'Исполнители и роли'],
  ['showContractSum', 'Договорная сумма'],
  ['showPayments', 'Оплаты, остаток и статус оплаты'],
  ['showTransactions', 'Транзакции'],
  ['showPayouts', 'Выплаты исполнителям'],
  ['showAdditionalEvents', 'Дополнительные события'],
  ['showNavigationLinks', 'Ссылки для навигации'],
  ['showOrderLink', 'Ссылка на заказ PartyCRM'],
  ['showStatusIcons', 'Иконки финансового состояния'],
]

const STATUS_COLORS = [
  ['draft', 'Черновик'],
  ['active', 'Активный'],
  ['canceled', 'Отменён'],
  ['closed', 'Закрыт'],
]

const GOOGLE_COLORS = [
  ['1', 'Лавандовый'],
  ['2', 'Мятный'],
  ['3', 'Фиолетовый'],
  ['4', 'Коралловый'],
  ['5', 'Жёлтый'],
  ['6', 'Оранжевый'],
  ['7', 'Бирюзовый'],
  ['8', 'Серый'],
  ['9', 'Синий'],
  ['10', 'Зелёный'],
  ['11', 'Красный'],
]

const DEFAULT_SETTINGS = {
  reminders: { useDefault: false, overrides: [] },
  statusColors: { draft: '8', active: '9', canceled: '11', closed: '10' },
  syncSettings: Object.fromEntries([
    ['titleMode', 'eventType_services'],
    ...SYNC_FIELDS.map(([key]) => [key, true]),
  ]),
  deleteCanceledFromCalendar: false,
}

const buttonClass =
  'cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400'

const formatDate = (value) => {
  if (!value) return 'нет данных'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU') : 'нет данных'
}

const errorLabel = (code) => {
  const labels = {
    reconnect_required: 'Нужно переподключить Google-аккаунт',
    calendar_sync_failed: 'Последняя синхронизация завершилась с ошибкой',
    calendar_sync_unavailable: 'Синхронизация сейчас недоступна',
  }
  return labels[code] || code || 'нет'
}

const Section = ({ title, children }) => (
  <section className="grid gap-3 rounded-xl border border-sky-100 bg-sky-50/40 p-3 sm:p-4">
    <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
    {children}
  </section>
)

const Toggle = ({ checked, children, disabled = false, onChange }) => (
  <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-0.5 cursor-pointer disabled:cursor-not-allowed"
    />
    <span>{children}</span>
  </label>
)

export default function PartyGoogleCalendarSettings({
  activeCompanyId,
  companyTimeZone = 'Europe/Moscow',
  locked = false,
  status,
  statusLoading,
  reloadStatus,
  oauthNotice = null,
  draftSyncVersion = 0,
}) {
  const [draft, setDraft] = useState(DEFAULT_SETTINGS)
  const [draftDirty, setDraftDirty] = useState(false)
  const [calendars, setCalendars] = useState([])
  const [calendarId, setCalendarId] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [syncProgress, setSyncProgress] = useState(null)
  const appliedDraftSyncVersion = useRef(-1)
  const draftRef = useRef(draft)
  const draftDirtyRef = useRef(draftDirty)
  draftRef.current = draft
  draftDirtyRef.current = draftDirty

  const headers = useMemo(
    () => ({ 'x-partycrm-company-id': activeCompanyId }),
    [activeCompanyId]
  )

  useEffect(() => {
    if (!status) return
    const next = getNextCalendarDraftState({
      currentDraft: draftRef.current,
      dirty: draftDirtyRef.current,
      syncDraft: draftSyncVersion !== appliedDraftSyncVersion.current,
      statusSettings: { ...DEFAULT_SETTINGS, ...(status.settings || {}) },
    })
    setDraft(next.draft)
    setDraftDirty(next.dirty)
    appliedDraftSyncVersion.current = draftSyncVersion
    setCalendarId(status.calendarId || '')
  }, [draftSyncVersion, status])

  const updateDraft = (updater) => {
    setDraft(updater)
    setDraftDirty(true)
  }

  useEffect(() => {
    if (!oauthNotice) return
    setMessage(oauthNotice.success ? 'Google-аккаунт подключён.' : '')
    setError(oauthNotice.success ? '' : errorLabel(oauthNotice.error))
  }, [oauthNotice])

  const run = async (name, action) => {
    setBusy(name)
    setError('')
    setMessage('')
    try {
      return await action()
    } catch (actionError) {
      setError(actionError.message || 'Не удалось выполнить действие')
      return null
    } finally {
      setBusy('')
    }
  }

  const connect = () =>
    run('connect', async () => {
      const response = await apiJson('/api/party/google-calendar/auth-url', {
        cache: 'no-store',
        headers,
      })
      window.location.assign(response.data.url)
    })

  const loadCalendars = () =>
    run('calendars', async () => {
      const response = await apiJson('/api/party/google-calendar/calendars', {
        cache: 'no-store',
        headers,
      })
      setCalendars(response.data?.calendars || [])
      setMessage('Список календарей обновлён.')
    })

  const selectCalendar = () =>
    run('select', async () => {
      await apiJson('/api/party/google-calendar/select', {
        method: 'POST',
        headers,
        body: JSON.stringify({ calendarId }),
      })
      await reloadStatus?.({ syncDraft: false })
      setMessage('Календарь выбран.')
    })

  const saveSettings = () =>
    run('save', async () => {
      await apiJson('/api/party/google-calendar/settings', {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: status?.enabled === true, ...draft }),
      })
      await reloadStatus?.({ syncDraft: true })
      setMessage('Настройки синхронизации сохранены.')
    })

  const toggleEnabled = (enabled) =>
    run('enabled', async () => {
      await apiJson('/api/party/google-calendar/settings', {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled }),
      })
      await reloadStatus?.({ syncDraft: false })
      setMessage(enabled ? 'Синхронизация включена.' : 'Синхронизация выключена.')
    })

  const disconnect = async () => {
    if (
      !window.confirm(
        'Отключить Google Calendar? Уже созданные события останутся в календаре.'
      )
    ) {
      return
    }
    await run('disconnect', async () => {
      await apiJson('/api/party/google-calendar/disconnect', {
        method: 'POST',
        headers,
      })
      setCalendars([])
      setSyncProgress(null)
      await reloadStatus?.({ syncDraft: true })
      setMessage('Google Calendar отключён.')
    })
  }

  const syncFuture = async () => {
    if (
      !window.confirm(
        'Синхронизировать все текущие и будущие заказы с выбранным календарём?'
      )
    ) {
      return
    }
    await run('sync', async () => {
      let cursor = ''
      let iteration = 0
      const total = { processed: 0, synced: 0, failed: 0, skipped: 0 }
      let done = false
      setSyncProgress({ ...total, done })
      while (!done) {
        const response = await apiJson(
          '/api/party/google-calendar/sync-future',
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ cursor }),
          }
        )
        const batch = response.data || {}
        for (const key of Object.keys(total)) total[key] += Number(batch[key]) || 0
        done = batch.done !== false
        setSyncProgress({ ...total, done })
        if (!done) {
          iteration += 1
          cursor = getNextSyncCursor({
            currentCursor: cursor,
            nextCursor: batch.nextCursor,
            iteration,
          })
        }
      }
      await reloadStatus?.({ syncDraft: false })
      setMessage('Синхронизация будущих заказов завершена.')
    })
  }

  const connected = status?.connected === true
  const actionsDisabled = locked || statusLoading || Boolean(busy)

  if (statusLoading && !status) {
    return <div className="text-sm text-slate-500">Проверяем Google Calendar...</div>
  }

  return (
    <fieldset disabled={locked} className="grid gap-4 disabled:opacity-60">
      {message ? (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!connected ? (
        <div className="grid gap-3">
          <p className="text-sm leading-6 text-slate-600">
            Подключите Google-аккаунт компании, затем выберите календарь. PartyCRM только создаёт и обновляет события и не импортирует данные из Google.
          </p>
          <div>
            <button type="button" onClick={connect} disabled={actionsDisabled} className={`${buttonClass} bg-sky-600 text-white hover:bg-sky-700`}>
              {busy === 'connect' ? 'Подключаем...' : 'Подключить Google Calendar'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <Section title="Подключение">
            <div className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
              <div><span className="font-semibold text-slate-800">Аккаунт:</span> {status.email || 'не указан'}</div>
              <div><span className="font-semibold text-slate-800">Календарь:</span> {status.calendarName || 'не выбран'}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={connect} disabled={actionsDisabled} className={`${buttonClass} border border-sky-200 text-sky-700 hover:bg-white`}>Переподключить</button>
              <button type="button" onClick={disconnect} disabled={actionsDisabled} className={`${buttonClass} border border-red-200 text-red-600 hover:bg-red-50`}>Отключить</button>
            </div>
          </Section>

          <Section title="Календарь и синхронизация">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Календарь Google</span>
                <select value={calendarId} onChange={(event) => setCalendarId(event.target.value)} className="h-11 cursor-pointer rounded-lg border border-sky-100 bg-white px-3 text-sm">
                  <option value="">{status.calendarName || 'Выберите календарь'}</option>
                  {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name || calendar.summary || calendar.id}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button type="button" onClick={loadCalendars} disabled={actionsDisabled} className={`${buttonClass} border border-sky-200 text-sky-700 hover:bg-white`}>Обновить список</button>
                <button type="button" onClick={selectCalendar} disabled={actionsDisabled || !calendarId} className={`${buttonClass} bg-sky-600 text-white hover:bg-sky-700`}>Выбрать</button>
              </div>
            </div>
            <Toggle checked={status.enabled === true} disabled={actionsDisabled || !status.calendarId} onChange={toggleEnabled}>Синхронизировать изменения PartyCRM с Google Calendar</Toggle>
            <p className="text-xs text-slate-500">Часовой пояс событий: {companyTimeZone || 'Europe/Moscow'}</p>
          </Section>

          <Section title="Заголовок и содержимое">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Заголовок события</span>
              <select value={draft.syncSettings?.titleMode || 'eventType_services'} onChange={(event) => updateDraft((value) => ({ ...value, syncSettings: { ...value.syncSettings, titleMode: event.target.value } }))} className="h-11 cursor-pointer rounded-lg border border-sky-100 bg-white px-3 text-sm">
                {TITLE_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {SYNC_FIELDS.map(([key, label]) => (
                <Toggle key={key} checked={draft.syncSettings?.[key] !== false} onChange={(checked) => updateDraft((value) => ({ ...value, syncSettings: { ...value.syncSettings, [key]: checked } }))}>{label}</Toggle>
              ))}
            </div>
          </Section>

          <Section title="Напоминания">
            <Toggle checked={draft.reminders?.useDefault === true} onChange={(checked) => updateDraft((value) => ({ ...value, reminders: { ...value.reminders, useDefault: checked } }))}>Использовать стандартные напоминания Google Calendar</Toggle>
            {!draft.reminders?.useDefault ? (
              <div className="grid gap-2">
                {(draft.reminders?.overrides || []).map((reminder, index) => (
                  <div key={`${reminder.method}-${index}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <select aria-label={`Тип напоминания ${index + 1}`} value={reminder.method} onChange={(event) => updateDraft((value) => ({ ...value, reminders: { ...value.reminders, overrides: value.reminders.overrides.map((item, itemIndex) => itemIndex === index ? { ...item, method: event.target.value } : item) } }))} className="h-10 cursor-pointer rounded-lg border border-sky-100 bg-white px-2 text-sm"><option value="popup">Всплывающее</option><option value="email">Email</option></select>
                    <input aria-label={`Минут до события ${index + 1}`} type="number" min="1" value={reminder.minutes} onChange={(event) => updateDraft((value) => ({ ...value, reminders: { ...value.reminders, overrides: value.reminders.overrides.map((item, itemIndex) => itemIndex === index ? { ...item, minutes: Math.max(1, Number(event.target.value) || 1) } : item) } }))} className="h-10 min-w-0 rounded-lg border border-sky-100 px-2 text-sm" />
                    <button type="button" aria-label={`Удалить напоминание ${index + 1}`} onClick={() => updateDraft((value) => ({ ...value, reminders: { ...value.reminders, overrides: value.reminders.overrides.filter((_, itemIndex) => itemIndex !== index) } }))} className={`${buttonClass} border border-red-200 text-red-600`}>Удалить</button>
                  </div>
                ))}
                <button type="button" onClick={() => updateDraft((value) => ({ ...value, reminders: { ...value.reminders, overrides: [...(value.reminders.overrides || []), { method: 'popup', minutes: 60 }] } }))} className={`${buttonClass} w-fit border border-sky-200 text-sky-700`}>Добавить напоминание</button>
              </div>
            ) : null}
          </Section>

          <Section title="Цвета и отменённые заказы">
            <div className="grid gap-3 sm:grid-cols-2">
              {STATUS_COLORS.map(([key, label]) => (
                <label key={key} className="grid gap-1.5 text-xs font-semibold text-slate-600">{label}<select value={draft.statusColors?.[key] || ''} onChange={(event) => updateDraft((value) => ({ ...value, statusColors: { ...value.statusColors, [key]: event.target.value } }))} className="h-10 cursor-pointer rounded-lg border border-sky-100 bg-white px-2 text-sm font-normal text-slate-800">{GOOGLE_COLORS.map(([value, color]) => <option key={value} value={value}>{color}</option>)}</select></label>
              ))}
            </div>
            <Toggle checked={draft.deleteCanceledFromCalendar === true} onChange={(checked) => updateDraft((value) => ({ ...value, deleteCanceledFromCalendar: checked }))}>Удалять отменённые заказы из Google Calendar. Если выключено, событие останется с пометкой «ОТМЕНЕНО».</Toggle>
            <button type="button" onClick={saveSettings} disabled={actionsDisabled} className={`${buttonClass} w-fit bg-sky-600 text-white hover:bg-sky-700`}>{busy === 'save' ? 'Сохраняем...' : 'Сохранить настройки'}</button>
          </Section>

          <Section title="Синхронизация будущих заказов">
            <p className="text-sm leading-6 text-slate-600">Запуск создаст или обновит события для заказов с сегодняшнего дня. Операцию можно безопасно повторять.</p>
            <button type="button" onClick={syncFuture} disabled={actionsDisabled || !status.enabled || !status.calendarId} className={`${buttonClass} w-fit bg-sky-600 text-white hover:bg-sky-700`}>{busy === 'sync' ? 'Синхронизируем...' : 'Синхронизировать будущие заказы'}</button>
            {syncProgress ? <div role="status" className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-white p-3 text-xs text-slate-600 sm:grid-cols-4"><span>Обработано: {syncProgress.processed}</span><span>Синхронизировано: {syncProgress.synced}</span><span>Пропущено: {syncProgress.skipped}</span><span className={syncProgress.failed ? 'text-red-600' : ''}>Ошибки: {syncProgress.failed}</span></div> : null}
          </Section>

          <Section title="Диагностика">
            <div className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2"><div>Подключено: {formatDate(status.diagnostics?.connectedAt)}</div><div>Последняя синхронизация: {formatDate(status.diagnostics?.lastSyncAt)}</div><div className="sm:col-span-2">Последняя ошибка: {errorLabel(status.diagnostics?.lastSyncError)}</div></div>
          </Section>
        </>
      )}
    </fieldset>
  )
}
