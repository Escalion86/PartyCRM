'use client'

import { useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const control =
  'mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'

export default function PartyPreparationTemplateApply(props) {
  return (
    <PartyPreparationTemplateApplyContent
      key={`${props.companyId}:${props.orderId}`}
      {...props}
    />
  )
}

function PartyPreparationTemplateApplyContent({
  companyId,
  orderId,
  disabled = false,
  onApplied,
  onPendingChange,
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [templateId, setTemplateId] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const submitting = useRef(false)
  const headers = { 'x-partycrm-company-id': companyId }
  useEffect(() => {
    onPendingChange?.(busy)
    return () => onPendingChange?.(false)
  }, [busy, onPendingChange])
  useEffect(() => {
    if (!open) return
    const current = ++generation.current
    const controller = new AbortController()
    apiJson('/api/party/preparation-templates', {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'x-partycrm-company-id': companyId },
    })
      .then((response) => {
        if (generation.current === current) setData(response.data)
      })
      .catch((cause) => {
        if (generation.current === current && cause.name !== 'AbortError')
          setError(cause.message || 'Не удалось загрузить шаблоны')
      })
    return () => {
      generation.current += 1
      controller.abort()
    }
  }, [companyId, open])
  const action = async (apply) => {
    if (
      busy ||
      submitting.current ||
      disabled ||
      !templateId ||
      (apply && !preview)
    )
      return
    const current = generation.current
    submitting.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await apiJson(
        `/api/party/orders/${orderId}/preparation-template`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: apply ? 'apply' : 'preview',
            templateId,
            ...(apply ? { previewToken: preview.previewToken } : {}),
          }),
        }
      )
      if (generation.current !== current) return
      if (apply) {
        setPreview(null)
        setNotice(
          `Добавлено задач: ${response.data.createdCount}. Уже были добавлены: ${response.data.skippedCount}.${response.data.effectsWarning ? ' Задачи сохранены; уведомления будут повторены системой.' : ''}`
        )
        try {
          await onApplied?.()
        } catch {
          if (generation.current === current)
            setError(
              'Задачи сохранены. Не удалось обновить список — обновите заказ перед дальнейшими изменениями.'
            )
        }
      } else setPreview(response.data)
    } catch (cause) {
      if (generation.current === current) {
        setError(cause.message || 'Не удалось применить шаблон')
        if (cause.status === 409) setPreview(null)
      }
    } finally {
      submitting.current = false
      if (generation.current === current) setBusy(false)
    }
  }
  const staff = new Map(
    (data?.staff || []).map((person) => [person._id, person.name])
  )
  const roles = new Map(
    (data?.roles || []).map((role) => [role._id, role.title])
  )
  return (
    <details
      className="mb-4 rounded-xl border border-sky-100 bg-sky-50/40 p-3"
      open={open}
      onToggle={(event) => {
        if (!busy) setOpen(event.currentTarget.open)
      }}
    >
      <summary className="min-h-8 cursor-pointer text-sm font-semibold text-sky-900">
        Добавить задачи из шаблона
      </summary>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-5 text-slate-600">
            Сначала проверьте ответственных и сроки. Уже созданные задачи
            сохраняются. При переносе мероприятия их сроки автоматически не
            меняются.
          </p>
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              {notice}
            </p>
          ) : null}
          {disabled ? (
            <p className="text-xs text-amber-900">
              Сначала сохраните или отмените изменения в заказе и открытых
              разделах.
            </p>
          ) : null}
          {!data ? (
            <p role="status" className="text-sm text-slate-500">
              {error
                ? 'Не удалось получить шаблоны. Закройте и откройте этот блок, чтобы повторить.'
                : 'Загрузка шаблонов…'}
            </p>
          ) : !data.templates.length ? (
            <p className="text-sm text-slate-500">
              Шаблонов пока нет. Владелец или администратор может создать их в
              настройках компании → «Шаблоны задач».
            </p>
          ) : (
            <>
              <label className="block text-sm">
                Шаблон
                <select
                  className={control}
                  disabled={busy || disabled}
                  value={templateId}
                  onChange={(event) => {
                    setTemplateId(event.target.value)
                    setPreview(null)
                    setNotice('')
                    setError('')
                  }}
                >
                  <option value="">Выберите шаблон</option>
                  {data.templates.map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.title} · задач: {template.items.length}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={button}
                disabled={busy || disabled || !templateId}
                onClick={() => action(false)}
              >
                {busy ? 'Подождите…' : 'Проверить задачи и сроки'}
              </button>
            </>
          )}
          {preview ? (
            <div className="space-y-3">
              <ul className="space-y-2">
                {preview.items.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                  >
                    <p className="font-semibold break-words">{item.title}</p>
                    {item.alreadyCreated ? (
                      <p className="mt-1 text-emerald-800">
                        Уже добавлена. Существующие срок и назначение
                        сохраняются — см. задачу в списке.
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-slate-600">
                          {item.assigneeRoleId
                            ? `Должность: ${roles.get(item.assigneeRoleId) || 'Недоступна'}`
                            : (item.assigneeStaffIds || [])
                                .map(
                                  (id) =>
                                    staff.get(id) || 'Сотрудник недоступен'
                                )
                                .join(', ')}
                        </p>
                        <p className="text-slate-600">
                          {item.dueAt
                            ? `Срок: ${new Date(item.dueAt).toLocaleString('ru-RU', { timeZone: preview.timeZone })} (${preview.timeZone})`
                            : 'Без срока'}
                        </p>
                        {item.overdue ? (
                          <p className="text-amber-900">
                            Расчётный срок уже прошёл.
                          </p>
                        ) : null}
                        {item.afterEvent ? (
                          <p className="text-amber-900">
                            Срок позже окончания мероприятия.
                          </p>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-600">
                Будет создано: {preview.createCount}. Пропущено ранее
                добавленных: {preview.skipCount}.
              </p>
              <button
                type="button"
                className={button + ' bg-white'}
                disabled={busy || disabled || !preview.createCount}
                onClick={() => action(true)}
              >
                Добавить задачи · {preview.createCount}
              </button>
              <button
                type="button"
                className={button + ' ml-2'}
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Отмена
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </details>
  )
}
