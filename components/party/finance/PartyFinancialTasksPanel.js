'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const button =
  'min-h-10 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const control =
  'mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm disabled:bg-slate-50'
const statusMeta = {
  pending: {
    label: 'Ожидает выполнения',
    className: 'bg-amber-100 text-amber-800',
  },
  submitted: { label: 'На проверке', className: 'bg-sky-100 text-sky-800' },
  completed: {
    label: 'Выполнено',
    className: 'bg-emerald-100 text-emerald-800',
  },
  canceled: { label: 'Отменено', className: 'bg-slate-100 text-slate-600' },
}
const typeMeta = {
  receive_from_client: 'Получить деньги от клиента',
  transfer_to_company: 'Передать деньги компании',
}
const paymentMethodMeta = {
  cash: 'Наличные',
  transfer: 'Перевод',
  account: 'Расчётный счёт',
  other: 'Другой способ',
}
const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
})

const money = (kopecks) => moneyFormatter.format(Number(kopecks || 0) / 100)
const rubles = (kopecks) =>
  Number.isFinite(Number(kopecks))
    ? String(Number(kopecks) / 100).replace('.', ',')
    : ''
const toKopecks = (value) => {
  const normalized = String(value || '')
    .trim()
    .replace(',', '.')
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(
      'Укажите сумму в рублях, не более двух знаков после запятой'
    )
  }
  const [whole, fraction = ''] = normalized.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
const personName = (person) =>
  [person?.firstName, person?.secondName].filter(Boolean).join(' ') ||
  person?.name ||
  'Сотрудник'
const defaultDueAt = () => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
const operationKey = () =>
  globalThis.crypto?.randomUUID?.() ||
  `money_task_${Date.now()}_${Math.random().toString(36).slice(2)}`

function FinancialTaskCard({ task, manager, headers, onReload, staff }) {
  const plannedAmount = task.amountKopecks ?? 0
  const assignee = staff.find(
    (item) => String(item._id) === String(task.responsibleStaffId)
  )
  const [actualAmount, setActualAmount] = useState(
    rubles(task.submittedAmountKopecks ?? plannedAmount)
  )
  const [completionComment, setCompletionComment] = useState(
    task.submissionComment || ''
  )
  const [reviewComment, setReviewComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const idempotencyKey = useRef(operationKey())

  const mutate = async (action, body = {}) => {
    setBusy(true)
    setError('')
    try {
      await apiJson(`/api/party/money-tasks/${task._id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action, revision: task.revision, ...body }),
      })
      await onReload()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const submitCompletion = () => {
    try {
      return mutate('submit_completion', {
        actualAmountKopecks: toKopecks(actualAmount),
        comment: completionComment.trim(),
      })
    } catch (cause) {
      setError(cause.message)
    }
  }

  const meta = statusMeta[task.status] || {
    label: task.status || 'Статус не указан',
    className: 'bg-slate-100 text-slate-700',
  }
  return (
    <article className="space-y-3 rounded-xl border border-sky-100 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold break-words text-slate-900">
            {typeMeta[task.type] || 'Денежное поручение'}
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            {task.staffName || personName(assignee)}
          </p>
        </div>
        <span
          className={`rounded px-2 py-1 text-xs font-semibold ${meta.className}`}
        >
          {meta.label}
        </span>
      </div>
      <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
        <div>
          <span className="block text-xs text-slate-500">Поручено</span>
          <strong>{money(plannedAmount)}</strong>
        </div>
        {task.submittedAmountKopecks !== null &&
          task.submittedAmountKopecks !== undefined && (
            <div>
              <span className="block text-xs text-slate-500">
                Подтверждено исполнителем
              </span>
              <strong>{money(task.submittedAmountKopecks)}</strong>
            </div>
          )}
        {task.dueAt ? (
          <div>
            <span className="block text-xs text-slate-500">Срок</span>
            <strong>{new Date(task.dueAt).toLocaleString('ru-RU')}</strong>
          </div>
        ) : null}
        <div>
          <span className="block text-xs text-slate-500">Способ</span>
          <strong>
            {paymentMethodMeta[task.paymentMethod] || 'Не указан'}
          </strong>
        </div>
        <div>
          <span className="block text-xs text-slate-500">
            {task.type === 'receive_from_client'
              ? 'От кого получить'
              : 'Кому передать'}
          </span>
          <strong>{task.recipientLabel || 'Не указан'}</strong>
        </div>
        {manager && task.custodyBalanceKopecks !== undefined && (
          <div>
            <span className="block text-xs text-slate-500">
              Учтено у сотрудника после проведённых операций
            </span>
            <strong>{money(task.custodyBalanceKopecks)}</strong>
          </div>
        )}
      </div>
      {(task.comment || task.description) && (
        <p className="text-sm whitespace-pre-wrap text-slate-700">
          {task.comment || task.description}
        </p>
      )}
      {task.submissionComment && (
        <p className="rounded-lg bg-sky-50 p-2 text-sm whitespace-pre-wrap text-sky-900">
          Комментарий исполнителя: {task.submissionComment}
        </p>
      )}
      {task.reviewComment && (
        <p className="rounded-lg bg-amber-50 p-2 text-sm whitespace-pre-wrap text-amber-900">
          Комментарий руководителя: {task.reviewComment}
        </p>
      )}
      {!manager && task.status === 'pending' && (
        <div className="space-y-3 rounded-lg border border-sky-100 p-3">
          <label className="block text-sm">
            Фактическая сумма, ₽
            <input
              className={control}
              inputMode="decimal"
              placeholder={rubles(plannedAmount)}
              value={actualAmount}
              disabled={busy}
              onChange={(event) => {
                setActualAmount(event.target.value)
                setError('')
              }}
            />
          </label>
          <label className="block text-sm">
            Комментарий к выполнению
            <textarea
              className={control}
              rows={2}
              maxLength={2000}
              value={completionComment}
              disabled={busy}
              onChange={(event) => setCompletionComment(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${button} bg-sky-50`}
            disabled={busy || !actualAmount.trim()}
            onClick={submitCompletion}
          >
            Отправить выполнение на проверку
          </button>
        </div>
      )}
      {manager && task.status === 'submitted' && (
        <div className="space-y-3 rounded-lg border border-sky-100 p-3">
          <label className="block text-sm">
            Комментарий руководителя
            <textarea
              className={control}
              rows={2}
              maxLength={2000}
              placeholder="Причина обязательна при возврате"
              value={reviewComment}
              disabled={busy}
              onChange={(event) => setReviewComment(event.target.value)}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className={`${button} bg-emerald-50 text-emerald-800`}
              disabled={busy}
              onClick={() =>
                mutate('approve_completion', {
                  comment: reviewComment.trim(),
                  idempotencyKey: idempotencyKey.current,
                })
              }
            >
              Подтвердить выполнение
            </button>
            <button
              type="button"
              className={button}
              disabled={busy || !reviewComment.trim()}
              onClick={() =>
                mutate('request_revision', { comment: reviewComment.trim() })
              }
            >
              Вернуть на исправление
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Денежная операция фиксируется только после подтверждения выполнения.
          </p>
        </div>
      )}
      {manager && ['pending', 'submitted'].includes(task.status) && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => mutate('cancel', { comment: reviewComment.trim() })}
        >
          Отменить поручение
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </article>
  )
}

export default function PartyFinancialTasksPanel({
  companyId,
  orderId,
  staffId = '',
  assignments = [],
  staff = [],
  manager = false,
}) {
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState({
    staffId: '',
    type: 'receive_from_client',
    amount: '',
    dueAt: defaultDueAt(),
    paymentMethod: 'transfer',
    recipientLabel: '',
    comment: '',
  })
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const createIdempotencyKey = useRef(operationKey())
  const headers = useMemo(
    () => ({ 'x-partycrm-company-id': companyId }),
    [companyId]
  )
  const assignedIds = useMemo(
    () => [
      ...new Set(
        (assignments || [])
          .map((item) => String(item.staffId || item._id || ''))
          .filter(Boolean)
      ),
    ],
    [assignments]
  )
  const load = useCallback(async () => {
    if (!companyId || !orderId) {
      setBusy(false)
      return
    }
    setBusy(true)
    setError('')
    try {
      const query = new URLSearchParams({ orderId })
      if (staffId) query.set('staffId', staffId)
      const json = await apiJson(`/api/party/money-tasks?${query}`, { headers })
      const data = json.data?.tasks || json.data?.items || json.data || []
      setItems(
        Array.isArray(data)
          ? data.filter(
              (task) =>
                String(task.orderId) === String(orderId) &&
                (!staffId ||
                  String(task.responsibleStaffId) === String(staffId))
            )
          : []
      )
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }, [companyId, headers, orderId, staffId])
  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      await apiJson('/api/party/money-tasks', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderId,
          staffId: draft.staffId,
          responsibleStaffId: draft.staffId,
          type: draft.type,
          amountKopecks: toKopecks(draft.amount),
          dueAt: new Date(draft.dueAt).toISOString(),
          paymentMethod: draft.paymentMethod,
          recipientType:
            draft.type === 'receive_from_client' ? 'client' : 'company',
          recipientLabel: draft.recipientLabel.trim(),
          idempotencyKey: createIdempotencyKey.current,
          comment: draft.comment.trim(),
        }),
      })
      setDraft({
        staffId: '',
        type: 'receive_from_client',
        amount: '',
        dueAt: defaultDueAt(),
        paymentMethod: 'transfer',
        recipientLabel: '',
        comment: '',
      })
      createIdempotencyKey.current = operationKey()
      await load()
    } catch (cause) {
      setError(cause.message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {manager && (
        <div className="grid gap-3 rounded-xl border border-sky-100 bg-sky-50/40 p-3 sm:grid-cols-2">
          <label className="text-sm">
            Исполнитель
            <select
              className={control}
              value={draft.staffId}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  staffId: event.target.value,
                }))
              }
            >
              <option value="">Выберите сотрудника</option>
              {assignedIds.map((id) => {
                const person = staff.find((item) => String(item._id) === id)
                return (
                  <option key={id} value={id}>
                    {personName(person)}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="text-sm">
            Что нужно сделать
            <select
              className={control}
              value={draft.type}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  type: event.target.value,
                }))
              }
            >
              {Object.entries(typeMeta).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Сумма поручения, ₽
            <input
              className={control}
              inputMode="decimal"
              value={draft.amount}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
            />
          </label>
          <label className="text-sm">
            Выполнить до
            <input
              type="datetime-local"
              className={control}
              value={draft.dueAt}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dueAt: event.target.value,
                }))
              }
            />
          </label>
          <label className="text-sm">
            Способ передачи
            <select
              className={control}
              value={draft.paymentMethod}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  paymentMethod: event.target.value,
                }))
              }
            >
              {Object.entries(paymentMethodMeta).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            {draft.type === 'receive_from_client'
              ? 'От кого получить деньги'
              : 'Кому передать деньги'}
            <input
              className={control}
              maxLength={160}
              placeholder={
                draft.type === 'receive_from_client'
                  ? 'Например: заказчик на площадке'
                  : 'Например: Ксения Владимировна'
              }
              value={draft.recipientLabel}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  recipientLabel: event.target.value,
                }))
              }
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Пояснение
            <textarea
              className={control}
              rows={2}
              maxLength={2000}
              value={draft.comment}
              disabled={busy}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  comment: event.target.value,
                }))
              }
            />
          </label>
          <button
            type="button"
            className={`${button} sm:col-span-2 sm:justify-self-start`}
            disabled={
              busy ||
              !draft.staffId ||
              !draft.amount.trim() ||
              !draft.dueAt ||
              !draft.recipientLabel.trim()
            }
            onClick={create}
          >
            Создать поручение
          </button>
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm text-slate-500">
          Загрузка поручений…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {!busy && !error && items.length === 0 && (
        <p className="text-sm text-slate-500">
          Денежных поручений по заказу пока нет.
        </p>
      )}
      {items.map((task) => (
        <FinancialTaskCard
          key={task._id}
          task={task}
          manager={manager}
          headers={headers}
          onReload={load}
          staff={staff}
        />
      ))}
    </div>
  )
}
