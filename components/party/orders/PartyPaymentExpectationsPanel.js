'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import {
  PARTY_EXPECTATION_STATUSES,
  partyExpectationLabel,
} from '@helpers/partyPaymentExpectations'
import { partyDateAtTime, partyZonedParts } from '@helpers/partyWorkingSchedule'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import PartyInitialExpectations from './PartyInitialExpectations'

const input =
  'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
const money = (value) => Number(value || 0).toLocaleString('ru-RU') + ' ₽'
export default function PartyPaymentExpectationsPanel({
  companyId,
  order,
  context,
  disabled = false,
  onSaved,
  onDirtyChange,
}) {
  const [records, setRecords] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const timeZone = context.company?.settings?.timeZone || 'Asia/Krasnoyarsk'
  const can = (resource, action = 'read') =>
    canPartyAccess(context, { resource, action })
  const writable = !['closed', 'canceled'].includes(order.status)
  const canIncome = can('finance.payments', 'edit')
  const canExpense = can('finance.expenses', 'edit')
  usePartyUnsavedChanges(Boolean(draft), {
    label: 'ожидаемый платёж',
    scope: companyId,
    pending: busy,
  })
  useEffect(() => {
    onDirtyChange?.(Boolean(draft))
    return () => onDirtyChange?.(false)
  }, [draft, onDirtyChange])
  useEffect(() => {
    const controller = new AbortController()
    apiJson(`/api/party/payment-expectations?orderId=${order._id}`, {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setRecords(result.data)
          setError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [companyId, order._id, retry])
  const submit = async () => {
    if (busy || disabled || !draft) return
    setBusy(true)
    setError('')
    try {
      const record = records.find((item) => item._id === draft.id)
      const body =
        draft.action === 'create'
          ? { ...draft.value, orderId: order._id }
          : {
              ...draft.value,
              action: draft.action,
              expectedRevision: record.revision,
            }
      const result = await apiJson(
        draft.action === 'create'
          ? '/api/party/payment-expectations'
          : `/api/party/payment-expectations/${draft.id}`,
        {
          method: draft.action === 'create' ? 'POST' : 'PATCH',
          headers: {
            'x-partycrm-company-id': companyId,
            'Idempotency-Key': draft.key,
          },
          body: JSON.stringify(body),
        }
      )
      setRecords((previous) =>
        draft.action === 'create'
          ? [...previous, result.data]
          : previous.map((item) =>
              item._id === result.data._id ? result.data : item
            )
      )
      setDraft(null)
      if (draft.action === 'fulfill') {
        const latest = await apiJson(`/api/party/orders/${order._id}`, {
          headers: { 'x-partycrm-company-id': companyId },
          cache: 'no-store',
        })
        onSaved?.(latest.data)
      }
    } catch (cause) {
      setError(cause.message || 'Не удалось сохранить платёж')
    } finally {
      setBusy(false)
    }
  }
  const start = (action, record) => {
    setError('')
    setDraft({
      action,
      id: record?._id,
      key: crypto.randomUUID(),
      value:
        action === 'fulfill'
          ? {
              amount: record.remaining,
              date: new Date().toISOString(),
              paymentMethod: record.paymentMethod,
              comment: record.comment,
            }
          : action === 'cancel'
            ? {}
            : record
              ? {
                  type: record.type,
                  category: record.category,
                  amount: record.amount,
                  dueAt: record.dueAt,
                  paymentMethod: record.paymentMethod,
                  comment: record.comment,
                  staffId: record.staffId,
                }
              : {
                  type: canIncome ? 'income' : 'expense',
                  category: canIncome ? 'deposit' : 'other',
                  amount: '',
                  dueAt: '',
                  paymentMethod: 'transfer',
                  comment: '',
                },
    })
  }
  const edit = (patch) =>
    setDraft((previous) => ({
      ...previous,
      value: { ...previous.value, ...patch },
    }))
  const time = (value) =>
    new Date(value).toLocaleString('ru-RU', {
      timeZone,
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
  const dateParts = draft?.value.date
    ? partyZonedParts(draft.value.date, timeZone)
    : null
  return (
    <section className="space-y-3" aria-label="Ожидания платежей">
      <h3 className="font-semibold">Ожидаемые и исполненные платежи</h3>
      {error ? (
        <div role="alert" className="space-y-2 text-sm text-red-800">
          <p>{error}</p>
          {!draft ? (
            <button
              type="button"
              className={button}
              onClick={() => setRetry((value) => value + 1)}
            >
              Повторить загрузку
            </button>
          ) : null}
        </div>
      ) : null}
      {!records && !error ? (
        <p role="status" className="text-sm text-slate-600">
          Загрузка ожиданий…
        </p>
      ) : records?.length ? (
        <ul className="space-y-3">
          {records.map((record) => {
            const resource =
              record.type === 'income'
                ? 'finance.payments'
                : record.category === 'payout'
                  ? 'finance.payouts'
                  : 'finance.expenses'
            return (
              <li
                key={record._id}
                className={`space-y-2 rounded-xl border p-3 ${record.overdue ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">
                    {partyExpectationLabel(record)} · {money(record.amount)}
                  </p>
                  <p
                    className={`text-sm font-semibold ${record.overdue ? 'text-red-800' : 'text-slate-700'}`}
                  >
                    {PARTY_EXPECTATION_STATUSES[record.status]}
                    {record.overdue ? ' · просрочено' : ''}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  До {time(record.dueAt)} · Исполнено {money(record.paid)}
                  {record.status === 'pending'
                    ? ` · Осталось ${money(record.remaining)}`
                    : record.status === 'canceled' && record.remaining
                      ? ` · Ожидание ${money(record.remaining)} отменено`
                      : ''}
                </p>
                {record.comment ? (
                  <p className="break-words text-sm">{record.comment}</p>
                ) : null}
                {record.fulfillments.length ? (
                  <details>
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                      Фактические операции · {record.fulfillments.length}
                    </summary>
                    <ul className="space-y-2 text-sm">
                      {record.fulfillments.map((item) => (
                        <li key={item.transactionId}>
                          Исполнена · {money(item.amount)} · {time(item.date)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {writable &&
                can(resource, 'edit') &&
                record.status === 'pending' ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={button}
                      disabled={busy || disabled || Boolean(draft)}
                      onClick={() => start('fulfill', record)}
                    >
                      Записать исполнение
                    </button>
                    {record.category !== 'payout' ? (
                      <button
                        type="button"
                        className={button}
                        disabled={busy || disabled || Boolean(draft)}
                        onClick={() => start('edit', record)}
                      >
                        Изменить ожидание
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={button}
                      disabled={busy || disabled || Boolean(draft)}
                      onClick={() => start('cancel', record)}
                    >
                      Отменить остаток
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : records ? (
        <p className="text-sm text-slate-600">Ожидаемых платежей пока нет.</p>
      ) : null}
      {!draft && writable && (canIncome || canExpense) ? (
        <button
          type="button"
          className={button}
          disabled={busy || disabled || !records}
          onClick={() => start('create')}
        >
          Добавить ожидание платежа
        </button>
      ) : null}
      {draft ? (
        <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
          <fieldset disabled={busy || disabled} className="min-w-0 space-y-3">
            <legend className="mb-2 font-semibold">
              {draft.action === 'fulfill'
                ? 'Фактическое исполнение'
                : draft.action === 'cancel'
                  ? 'Отмена ожидания остатка'
                  : draft.action === 'edit'
                    ? 'Изменить ожидание'
                    : 'Новое ожидание'}
            </legend>
            {draft.action === 'cancel' ? (
              <p className="text-sm">
                Уже исполненная часть останется в финансовом журнале. Отменяется
                только ожидание неоплаченного остатка.
              </p>
            ) : draft.action === 'fulfill' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Фактически исполнено, ₽
                  <input
                    className={input}
                    type="number"
                    min="0.01"
                    max={
                      records.find((item) => item._id === draft.id)?.remaining
                    }
                    step="0.01"
                    value={draft.value.amount}
                    onChange={(event) => edit({ amount: event.target.value })}
                  />
                </label>
                <label className="text-sm">
                  Дата и время исполнения
                  <input
                    type="datetime-local"
                    className={input}
                    value={
                      dateParts
                        ? `${dateParts.year}-${dateParts.month}-${dateParts.day}T${dateParts.hour}:${dateParts.minute}`
                        : ''
                    }
                    onChange={(event) => {
                      if (event.target.value)
                        edit({
                          date: partyDateAtTime(
                            event.target.value.slice(0, 10),
                            event.target.value.slice(11, 16),
                            timeZone
                          ).toISOString(),
                        })
                    }}
                  />
                </label>
                <p className="text-xs text-slate-600 sm:col-span-2">
                  Можно указать часть суммы. Остаток продолжит ожидаться.
                </p>
              </div>
            ) : (
              <PartyInitialExpectations
                context={context}
                value={[draft.value]}
                onChange={(value) =>
                  value.length
                    ? setDraft({ ...draft, value: value[0] })
                    : setDraft(null)
                }
                timeZone={timeZone}
                disabled={busy || disabled}
                single
              />
            )}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy || disabled}
              onClick={submit}
            >
              {busy
                ? 'Сохранение…'
                : draft.action === 'fulfill'
                  ? 'Подтвердить фактический платёж'
                  : draft.action === 'cancel'
                    ? 'Отменить ожидание остатка'
                    : 'Сохранить ожидание'}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
