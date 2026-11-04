'use client'

import { canPartyAccess } from '@helpers/partyRolePermissions'
import {
  PARTY_ORDER_TRANSACTION_CATEGORY_LABELS,
  PARTY_ORDER_PAYMENT_METHOD_LABELS,
} from '@helpers/partyOrderTransactions'
import { partyDateAtTime, partyZonedParts } from '@helpers/partyWorkingSchedule'

const input =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
export default function PartyInitialExpectations({
  context,
  value,
  onChange,
  disabled,
  timeZone,
  single = false,
}) {
  const income = canPartyAccess(context, {
    resource: 'finance.payments',
    action: 'edit',
  })
  const expense = canPartyAccess(context, {
    resource: 'finance.expenses',
    action: 'edit',
  })
  if (!income && !expense) return null
  const edit = (index, patch) =>
    onChange(
      value.map((item, position) =>
        position === index ? { ...item, ...patch } : item
      )
    )
  return (
    <fieldset className="min-w-0 space-y-3" disabled={disabled}>
      <legend className="mb-2 font-semibold">Ожидаемые платежи</legend>
      <p className="text-sm text-slate-600">
        Обещанные суммы не учитываются как полученные деньги. Для каждой укажите
        крайний срок.
      </p>
      {value.map((item, index) => {
        const parts = item.dueAt ? partyZonedParts(item.dueAt, timeZone) : null
        const date = parts
          ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
          : ''
        return (
          <div
            key={item.localId || index}
            className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2"
          >
            <label className="text-sm">
              Направление
              <select
                className={`${input} cursor-pointer`}
                value={item.type}
                onChange={(event) =>
                  edit(index, {
                    type: event.target.value,
                    category:
                      event.target.value === 'income' ? 'deposit' : 'other',
                  })
                }
              >
                {income ? (
                  <option value="income">Поступление от клиента</option>
                ) : null}
                {expense ? (
                  <option value="expense">Расход по заказу</option>
                ) : null}
              </select>
            </label>
            <label className="text-sm">
              Категория
              <select
                className={`${input} cursor-pointer`}
                value={item.category}
                onChange={(event) =>
                  edit(index, { category: event.target.value })
                }
              >
                {(item.type === 'income'
                  ? ['deposit', 'final_payment', 'client_payment']
                  : ['refund', 'taxes', 'materials', 'travel', 'other']
                ).map((category) => (
                  <option value={category} key={category}>
                    {PARTY_ORDER_TRANSACTION_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Сумма, ₽
              <input
                type="number"
                min="0.01"
                step="0.01"
                className={input}
                value={item.amount}
                onChange={(event) =>
                  edit(index, { amount: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              Крайний срок
              <input
                type="datetime-local"
                className={input}
                value={date}
                onChange={(event) =>
                  edit(index, {
                    dueAt: event.target.value
                      ? partyDateAtTime(
                          event.target.value.slice(0, 10),
                          event.target.value.slice(11, 16),
                          timeZone
                        ).toISOString()
                      : '',
                  })
                }
              />
            </label>
            <label className="text-sm">
              Способ оплаты
              <select
                className={`${input} cursor-pointer`}
                value={item.paymentMethod}
                onChange={(event) =>
                  edit(index, { paymentMethod: event.target.value })
                }
              >
                {Object.entries(PARTY_ORDER_PAYMENT_METHOD_LABELS).map(
                  ([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="text-sm">
              Комментарий
              <input
                className={input}
                maxLength={1000}
                value={item.comment || ''}
                onChange={(event) =>
                  edit(index, { comment: event.target.value })
                }
              />
            </label>
            <button
              className={`${button} justify-self-start`}
              type="button"
              onClick={() =>
                onChange(value.filter((_, position) => position !== index))
              }
            >
              Убрать ожидание
            </button>
          </div>
        )
      })}
      {!single ? (
        <button
          type="button"
          className={button}
          disabled={value.length >= 50}
          onClick={() =>
            onChange([
              ...value,
              {
                localId: crypto.randomUUID(),
                type: income ? 'income' : 'expense',
                category: income ? 'deposit' : 'other',
                amount: '',
                dueAt: '',
                paymentMethod: 'transfer',
                comment: '',
              },
            ])
          }
        >
          Добавить ожидаемый платёж
        </button>
      ) : null}
    </fieldset>
  )
}
