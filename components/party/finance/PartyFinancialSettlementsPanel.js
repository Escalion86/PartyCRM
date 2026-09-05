'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const button =
  'min-h-10 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const control =
  'mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm disabled:bg-slate-50'
const statuses = {
  draft: 'Черновик',
  submitted: 'На проверке',
  approved: 'Утверждено',
  revision: 'Нужны правки',
}
const money = (kopecks) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
  }).format(Number(kopecks || 0) / 100)
const rubles = (kopecks) =>
  Number(kopecks || 0) ? String(Number(kopecks) / 100).replace('.', ',') : ''
const kopecks = (value, { signed = false } = {}) => {
  const normalized = String(value || '0')
    .trim()
    .replace(',', '.')
  const pattern = signed
    ? /^-?\d{1,12}(?:\.\d{1,2})?$/
    : /^\d{1,12}(?:\.\d{1,2})?$/
  if (!pattern.test(normalized))
    throw new Error(
      'Укажите сумму в рублях, не более двух знаков после запятой'
    )
  const sign = normalized.startsWith('-') ? -1 : 1
  const [whole, fraction = ''] = normalized.replace('-', '').split('.')
  return sign * (Number(whole) * 100 + Number(fraction.padEnd(2, '0')))
}
const personName = (person) =>
  [person?.firstName, person?.secondName].filter(Boolean).join(' ') ||
  person?.name ||
  'Сотрудник'

function SettlementCard({ item, manager, person, headers, onReload }) {
  const [draft, setDraft] = useState({
    accrual: rubles(item.accrualKopecks),
    deduction: rubles(item.deductionKopecks),
    transport: rubles(item.transportKopecks),
    otherExpense: rubles(item.otherExpenseKopecks),
    comment: item.comment || '',
  })
  const [operation, setOperation] = useState({
    type: '',
    amount: '',
    comment: '',
  })
  const [reviewComment, setReviewComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editable = ['draft', 'revision'].includes(item.status)

  const request = async (path, options) => {
    setBusy(true)
    setError('')
    try {
      await apiJson(path, { ...options, headers })
      await onReload()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  const save = () => {
    try {
      return request(`/api/party/financial-settlements/${item._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          accrualKopecks: kopecks(draft.accrual),
          deductionKopecks: kopecks(draft.deduction),
          transportKopecks: kopecks(draft.transport),
          otherExpenseKopecks: kopecks(draft.otherExpense),
          comment: draft.comment,
        }),
      })
    } catch (cause) {
      setError(cause.message)
    }
  }
  const changeStatus = (action) =>
    request(`/api/party/financial-settlements/${item._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action, comment: reviewComment }),
    })
  const addOperation = () => {
    try {
      return request(
        `/api/party/financial-settlements/${item._id}/operations`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: operation.type,
            amountKopecks: kopecks(operation.amount, {
              signed: operation.type === 'correction',
            }),
            comment: operation.comment,
            idempotencyKey: crypto.randomUUID(),
          }),
        }
      )
    } catch (cause) {
      setError(cause.message)
    }
  }

  return (
    <article className="space-y-3 rounded-xl border border-sky-100 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h4 className="font-semibold">{personName(person)}</h4>
          <p className="text-xs text-slate-500">
            {statuses[item.status] || item.status} · период {item.periodKey}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Остаток к выплате</p>
          <p className="text-lg font-semibold">{money(item.totals?.balance)}</p>
        </div>
      </div>
      {item.reviewComment && (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">
          Причина возврата: {item.reviewComment}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['accrual', 'Начислено'],
          ['deduction', 'Удержания'],
          ['transport', 'Транспортные'],
          ['otherExpense', 'Прочие расходы'],
        ].map(([key, label]) => (
          <label key={key} className="text-sm">
            {label}, ₽
            <input
              className={control}
              inputMode="decimal"
              value={draft[key]}
              disabled={busy || !editable}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>
      <label className="block text-sm">
        Комментарий
        <textarea
          className={control}
          rows={2}
          maxLength={2000}
          value={draft.comment}
          disabled={busy || !editable}
          onChange={(event) =>
            setDraft((current) => ({ ...current, comment: event.target.value }))
          }
        />
      </label>
      <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
        <span>Получено на месте: {money(item.totals?.receivedOnSite)}</span>
        <span>Уже выплачено: {money(item.totals?.paid)}</span>
        <span>Корректировки: {money(item.totals?.correction)}</span>
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={save}
          >
            Сохранить
          </button>
          <button
            type="button"
            className={`${button} bg-sky-50`}
            disabled={busy}
            onClick={() => changeStatus('submit')}
          >
            Отправить на проверку
          </button>
        </div>
      )}
      {manager && item.status === 'submitted' && (
        <div className="space-y-2 rounded-lg border border-sky-100 p-3">
          <input
            className={control}
            placeholder="Причина, если нужны правки"
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => changeStatus('approve')}
            >
              Утвердить
            </button>
            <button
              type="button"
              className={button}
              disabled={busy || !reviewComment.trim()}
              onClick={() => changeStatus('request_revision')}
            >
              Вернуть на доработку
            </button>
          </div>
        </div>
      )}
      {((!manager && editable) || (manager && item.status === 'approved')) && (
        <div className="grid gap-2 rounded-lg border border-emerald-100 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm">
            Операция
            <select
              className={control}
              value={operation.type}
              onChange={(event) =>
                setOperation((current) => ({
                  ...current,
                  type: event.target.value,
                }))
              }
            >
              <option value="">Выберите</option>
              {!manager && (
                <option value="received_on_site">Получил на празднике</option>
              )}
              {manager && <option value="payment">Выплата сотруднику</option>}
              {manager && <option value="correction">Корректировка</option>}
            </select>
          </label>
          <label className="text-sm">
            Сумма, ₽
            <input
              className={control}
              inputMode="decimal"
              value={operation.amount}
              onChange={(event) =>
                setOperation((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
            />
          </label>
          <button
            type="button"
            className={`${button} self-end`}
            disabled={busy || !operation.type || !operation.amount}
            onClick={addOperation}
          >
            Зафиксировать
          </button>
          {operation.type === 'correction' && (
            <label className="text-sm sm:col-span-3">
              Причина корректировки
              <input
                className={control}
                value={operation.comment}
                onChange={(event) =>
                  setOperation((current) => ({
                    ...current,
                    comment: event.target.value,
                  }))
                }
              />
            </label>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </article>
  )
}

export default function PartyFinancialSettlementsPanel({
  companyId,
  orderId,
  staffId = '',
  assignments = [],
  staff = [],
  manager = false,
}) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const headers = useMemo(
    () => ({ 'x-partycrm-company-id': companyId }),
    [companyId]
  )
  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const query = new URLSearchParams({ orderId })
      if (staffId) query.set('staffId', staffId)
      const result = await apiJson(
        `/api/party/financial-settlements?${query}`,
        {
          headers,
          cache: 'no-store',
        }
      )
      setItems(result.data || [])
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }, [headers, orderId, staffId])
  useEffect(() => {
    load()
  }, [load])

  const existingStaffIds = new Set(items.map((item) => String(item.staffId)))
  const missing = assignments.filter(
    (assignment) =>
      (!staffId || String(assignment.staffId) === String(staffId)) &&
      !existingStaffIds.has(String(assignment.staffId))
  )
  const create = async (assignedStaffId) => {
    setBusy(true)
    setError('')
    try {
      await apiJson('/api/party/financial-settlements', {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId, staffId: assignedStaffId }),
      })
      await load()
    } catch (cause) {
      setError(cause.message)
      setBusy(false)
    }
  }
  const staffById = new Map(staff.map((person) => [String(person._id), person]))

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Начисления, деньги, полученные на празднике, и выплаты фиксируются
        отдельными операциями. Повторная выплата сверх остатка блокируется.
      </p>
      {busy && !items.length && (
        <p className="text-sm text-slate-500">Загрузка расчётов…</p>
      )}
      {missing.map((assignment) => (
        <div
          key={String(assignment.staffId)}
          className="flex flex-col gap-2 rounded-lg border border-dashed border-sky-200 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="text-sm">
            Расчёт для {personName(staffById.get(String(assignment.staffId)))}
          </span>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => create(assignment.staffId)}
          >
            Создать расчёт
          </button>
        </div>
      ))}
      {!busy && !items.length && !missing.length && (
        <p className="text-sm text-slate-500">
          Для этого заказа расчётов пока нет.
        </p>
      )}
      {items.map((item) => (
        <SettlementCard
          key={`${item._id}:${item.updatedAt}`}
          item={item}
          manager={manager}
          person={staffById.get(String(item.staffId))}
          headers={headers}
          onReload={load}
        />
      ))}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}
