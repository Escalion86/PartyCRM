'use client'

import { useId, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const action =
  'inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600'

export function PartyOrderCalendarReviewBadge({ checked }) {
  return checked === false ? (
    <span className="status-chip status-chip--today">Не проверен</span>
  ) : null
}

export default function PartyOrderCalendarDetails({
  companyId,
  order,
  canReview,
  canChangeSync,
  onSaved,
}) {
  const syncHintId = useId()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const needsReview = order.calendarImportChecked === false
  const imported = Boolean(order.calendarImportedAt)
  const linked = Boolean(order.hasGoogleCalendarEvent || order.googleCalendarEventId)
  if (!needsReview && !linked && !imported) return null

  const showReviewAction = needsReview && imported && canReview
  const syncEnabled = order.googleCalendarSyncDisabled !== true
  const save = async (patch, success) => {
    if (saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { data } = await apiJson(`/api/party/orders/${order._id}`, {
        method: 'PATCH',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify(patch),
      })
      if (Object.keys(patch).some((field) => data?.[field] !== patch[field])) {
        throw new Error('Не удалось подтвердить сохранение. Откройте заказ заново.')
      }
      const updated = Object.fromEntries(
        Object.keys(patch).map((field) => [field, data[field]])
      )
      onSaved?.({ ...updated, ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}) })
      setNotice(success)
    } catch (cause) {
      setError(cause.message || 'Не удалось сохранить настройки заказа. Повторите попытку.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="space-y-2 rounded-xl border border-slate-200 p-3 sm:p-4"
      aria-label="Google Calendar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Google Calendar</h3>
        <PartyOrderCalendarReviewBadge checked={order.calendarImportChecked} />
      </div>
      {imported ? (
        <p className="text-sm text-slate-600">Заказ импортирован из календаря компании.</p>
      ) : null}
      {linked ? (
        canChangeSync ? (
          <div>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
              <input
                type="checkbox"
                role="switch"
                className="peer sr-only"
                checked={syncEnabled}
                disabled={saving}
                aria-describedby={syncHintId}
                onChange={(event) => {
                  const enabled = event.target.checked
                  save(
                    { googleCalendarSyncDisabled: !enabled },
                    enabled ? 'Синхронизация включена.' : 'Синхронизация выключена.'
                  )
                }}
              />
              <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-slate-500 after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full after:bg-white peer-checked:bg-sky-700 peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-600" />
              Синхронизировать с Google Calendar
            </label>
            <p id={syncHintId} className="text-sm text-slate-600">
              {imported
                ? 'При включении следующие правки названия и времени передадутся в исходное событие. Место передаётся, если это разрешено в настройках интеграции.'
                : 'При включении PartyCRM сможет изменять связанное событие в календаре компании.'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            {syncEnabled ? 'Синхронизация включена.' : 'Синхронизация выключена.'}
          </p>
        )
      ) : null}
      {order.googleCalendarEventUrl || showReviewAction ? (
        <div className="flex flex-wrap items-center gap-2">
          {showReviewAction ? (
            <button
              className={action + ' border border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60'}
              type="button"
              disabled={saving}
              onClick={() => save({ calendarImportChecked: true }, 'Заказ отмечен проверенным.')}
            >
              Отметить проверенным
            </button>
          ) : null}
          {order.googleCalendarEventUrl ? (
            <a
              className={action + ' underline underline-offset-4 hover:bg-sky-50'}
              href={order.googleCalendarEventUrl}
              target="_blank"
              rel="noreferrer"
            >
              Открыть в Google Calendar
            </a>
          ) : null}
        </div>
      ) : null}
      <p role="status" className={saving || notice ? 'text-sm text-slate-700' : 'sr-only'}>
        {saving ? 'Сохраняем…' : notice}
      </p>
      {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
    </section>
  )
}
