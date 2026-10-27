'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import FieldHelp from '@components/FieldHelp'

const control =
  'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const kinds = [
  {
    id: 'income',
    title: 'Оплата от клиента',
    resource: 'finance.payments',
    type: 'income',
    category: 'client_payment',
  },
  {
    id: 'payout',
    title: 'Выплата исполнителю',
    resource: 'finance.payouts',
    type: 'expense',
    category: 'payout',
  },
  {
    id: 'expense',
    title: 'Расход по заказу',
    resource: 'finance.expenses',
    type: 'expense',
    category: 'other',
  },
]

export default function PartyRoleOrderPayments({
  companyId,
  order,
  context,
  staff = [],
  disabled = false,
  onSaved,
  onDirtyChange,
}) {
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  usePartyUnsavedChanges(Boolean(draft), {
    label: 'финансовая операция',
    scope: companyId,
    pending: busy,
  })
  const recipients = order.payoutRecipients || order.assignedStaff || []
  const available = kinds.filter(
    (kind) =>
      canPartyAccess(context, { resource: kind.resource, action: 'edit' }) &&
      (kind.id !== 'payout' || recipients.length)
  )
  useEffect(() => {
    onDirtyChange?.(Boolean(draft))
    return () => onDirtyChange?.(false)
  }, [draft, onDirtyChange])
  if (
    !order._id ||
    ['closed', 'canceled'].includes(order.status) ||
    !available.length
  )
    return null
  const change = (field, value) =>
    setDraft((previous) => ({ ...previous, [field]: value }))
  const submit = async (event) => {
    event.preventDefault()
    if (busy || disabled) return
    setBusy(true)
    setError('')
    try {
      const kind = available.find((item) => item.id === draft.kind)
      if (!kind)
        throw new Error('Право на эту операцию недоступно. Обновите заказ.')
      const result = await apiJson('/api/party/transactions', {
        method: 'POST',
        headers: {
          'x-partycrm-company-id': companyId,
          'Idempotency-Key': draft.requestKey,
        },
        body: JSON.stringify({
          orderId: order._id,
          type: kind.type,
          category: kind.category,
          amount: draft.amount,
          staffId: kind.id === 'payout' ? draft.staffId : null,
          date: draft.date,
          paymentMethod: draft.paymentMethod,
          comment: draft.comment,
        }),
      })
      setDraft(null)
      onSaved?.({
        ...order,
        transactions: [...(order.transactions || []), result.data],
      })
    } catch (cause) {
      setError(cause.message || 'Не удалось записать оплату')
    } finally {
      setBusy(false)
    }
  }
  if (!draft)
    return (
      <button
        type="button"
        className={button}
        disabled={disabled}
        onClick={() => {
          setError('')
          setDraft({
            kind: available[0].id,
            amount: '',
            staffId: String(recipients[0]?.staffId || ''),
            paymentMethod: 'transfer',
            comment: '',
            date: new Date().toISOString(),
            requestKey: crypto.randomUUID(),
          })
        }}
      >
        Записать оплату или расход
      </button>
    )
  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3"
      aria-label="Запись оплаты"
    >
      <fieldset
        disabled={busy || disabled}
        className="grid gap-3 sm:grid-cols-2"
      >
        <legend className="mb-2 text-sm font-semibold">
          Новая финансовая операция{' '}
          <FieldHelp
            label="Финансовая операция"
            text="Здесь записывается фактическая оплата. Гонорар задаётся отдельно в команде заказа. Если компания требует принятый отчёт до выплаты, система проверит его перед сохранением."
          />
        </legend>
        <label className="text-sm">
          Операция
          <select
            className={control + ' cursor-pointer'}
            value={draft.kind}
            onChange={(event) => change('kind', event.target.value)}
          >
            {available.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Сумма, ₽
          <input
            className={control}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            value={draft.amount}
            onChange={(event) => change('amount', event.target.value)}
          />
        </label>
        {draft.kind === 'payout' ? (
          <label className="text-sm">
            Исполнитель
            <select
              className={control + ' cursor-pointer'}
              required
              value={draft.staffId}
              onChange={(event) => change('staffId', event.target.value)}
            >
              {recipients.map((assignment) => (
                <option
                  key={String(assignment.staffId)}
                  value={String(assignment.staffId)}
                >
                  {staff.find(
                    (person) =>
                      String(person._id) === String(assignment.staffId)
                  )?.name || 'Сотрудник'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm">
          Способ оплаты
          <select
            className={control + ' cursor-pointer'}
            value={draft.paymentMethod}
            onChange={(event) => change('paymentMethod', event.target.value)}
          >
            <option value="transfer">Перевод</option>
            <option value="account">Расчётный счёт</option>
            <option value="cash">Наличные</option>
            <option value="barter">Бартер</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Комментарий
          <textarea
            className={control}
            rows={2}
            maxLength={1000}
            value={draft.comment}
            onChange={(event) => change('comment', event.target.value)}
          />
        </label>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={button} disabled={busy || disabled}>
          {busy ? 'Сохранение…' : 'Записать операцию'}
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
    </form>
  )
}
