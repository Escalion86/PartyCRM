'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const ACTION_LABELS = {
  order_created: 'Создание заказа',
  order_updated: 'Изменение заказа',
  order_status_changed: 'Смена статуса',
  order_canceled: 'Отмена заказа',
  order_deleted: 'Удаление заказа',
  transaction_created: 'Добавление оплаты/расхода',
  transaction_updated: 'Изменение оплаты/расхода',
  transaction_deleted: 'Удаление оплаты/расхода',
  assignment_status_changed: 'Статус исполнителя',
  performer_report_submitted: 'Отчет исполнителя',
  performer_report_reviewed: 'Проверка отчета',
}

const ROLE_LABELS = {
  owner: 'Владелец',
  admin: 'Администратор',
  performer: 'Исполнитель',
  system: 'Система',
}

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Дата не указана'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatAuditValue = (value, entityLabels) => {
  if (!value || value === 'Не указано') return '—'
  const date = new Date(value)
  if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(date.getTime())) {
    return formatDateTime(date)
  }
  return String(value).replace(
    /(Сотрудник|Услуга|Точка) #([a-f\d]{6})/gi,
    (match, type, suffix) =>
      entityLabels.get(`${type.toLowerCase()}:${suffix.toLowerCase()}`) || match
  )
}

const requestOptions = (companyId) => ({
  cache: 'no-store',
  headers: { 'x-partycrm-company-id': companyId },
})

export default function PartyAuditLog({
  activeCompanyId,
  staff = [],
  services = [],
  locations = [],
  orderId = '',
  deferred = false,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(!deferred)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState('')
  const [actorStaffId, setActorStaffId] = useState('')
  const [action, setAction] = useState('')

  const staffOptions = useMemo(
    () => staff.filter((item) => item?._id),
    [staff]
  )
  const entityLabels = useMemo(
    () =>
      new Map(
        [
          ...staffOptions.map((item) => [
            `сотрудник:${String(item._id).slice(-6).toLowerCase()}`,
            [item.secondName, item.firstName].filter(Boolean).join(' ') ||
              item.phone ||
              'Без имени',
          ]),
          ...services.map((item) => [
            `услуга:${String(item._id).slice(-6).toLowerCase()}`,
            item.title || 'Услуга без названия',
          ]),
          ...locations.map((item) => [
            `точка:${String(item._id).slice(-6).toLowerCase()}`,
            item.title || 'Точка без названия',
          ]),
        ]
      ),
    [locations, services, staffOptions]
  )

  const load = useCallback(
    async ({ append = false, cursor = '' } = {}) => {
      if (!activeCompanyId) return
      setLoading(true)
      setError('')
      try {
        const search = new URLSearchParams({ limit: orderId ? '50' : '30' })
        if (orderId) search.set('orderId', orderId)
        if (actorStaffId) search.set('actorStaffId', actorStaffId)
        if (action) search.set('action', action)
        if (cursor) search.set('before', cursor)
        const response = await apiJson(
          `/api/party/audit-log?${search}`,
          requestOptions(activeCompanyId)
        )
        const nextItems = response.data ?? []
        setItems((current) => (append ? [...current, ...nextItems] : nextItems))
        setHasMore(Boolean(response.pagination?.hasMore))
        setNextCursor(response.pagination?.nextCursor || '')
        setLoaded(true)
      } catch (loadError) {
        setError(loadError?.message || 'Не удалось загрузить историю действий')
        setLoaded(true)
      } finally {
        setLoading(false)
      }
    },
    [action, activeCompanyId, actorStaffId, orderId]
  )

  useEffect(() => {
    setItems([])
    setHasMore(false)
    setNextCursor('')
    if (!deferred) load()
  }, [deferred, load])

  if (!loaded && deferred) {
    return (
      <button
        type="button"
        className="cursor-pointer rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
        onClick={() => load()}
        disabled={loading}
      >
        {loading ? 'Загружаем…' : 'Показать историю действий'}
      </button>
    )
  }

  return (
    <div className="grid gap-3">
      {!orderId ? (
        <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold text-slate-600">
            Пользователь
            <select
              value={actorStaffId}
              onChange={(event) => setActorStaffId(event.target.value)}
              className="cursor-pointer rounded border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900"
            >
              <option value="">Все пользователи</option>
              {staffOptions.map((item) => (
                <option key={item._id} value={item._id}>
                  {[item.secondName, item.firstName].filter(Boolean).join(' ') || item.phone || 'Без имени'}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-600">
            Действие
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className="cursor-pointer rounded border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900"
            >
              <option value="">Все действия</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 sm:col-span-2 sm:justify-self-end"
            onClick={() => load()}
            disabled={loading}
          >
            Применить фильтры
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {!loading && items.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
          История действий пока пуста. Новые изменения будут появляться здесь.
        </div>
      ) : null}

      <div className="grid gap-2">
        {items.map((item) => (
          <article key={item._id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold break-words text-slate-900">{item.summary}</div>
                {!orderId ? (
                  <div className="mt-1 text-sm text-sky-700">{item.entityTitle || 'Заказ'}</div>
                ) : null}
              </div>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                {ACTION_LABELS[item.action] || item.action}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{item.actorName || 'Система'}</span>
              <span>·</span>
              <span>{ROLE_LABELS[item.actorRole] || item.actorRole}</span>
              <span>·</span>
              <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
            </div>
            {Array.isArray(item.changes) && item.changes.length > 0 ? (
              <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
                {item.changes.map((change) => (
                  <div key={`${item._id}-${change.field}`} className="grid gap-1 text-xs sm:grid-cols-[10rem_1fr]">
                    <div className="font-semibold text-slate-600">{change.label}</div>
                    <div className="min-w-0 break-words text-slate-700">
                      <span className="line-through decoration-red-300">{formatAuditValue(change.before, entityLabels)}</span>
                      <span className="mx-2 text-slate-400">→</span>
                      <span className="font-semibold text-emerald-700">{formatAuditValue(change.after, entityLabels)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {loading ? <div className="py-2 text-center text-sm text-slate-500">Загружаем историю…</div> : null}
      {hasMore && !loading ? (
        <button
          type="button"
          className="cursor-pointer rounded border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => load({ append: true, cursor: nextCursor })}
        >
          Показать ещё
        </button>
      ) : null}
    </div>
  )
}
