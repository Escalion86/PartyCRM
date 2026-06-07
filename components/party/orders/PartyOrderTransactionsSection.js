'use client'

import { useMemo, useState } from 'react'
import {
  PARTY_ORDER_PAYMENT_METHODS,
  PARTY_ORDER_TRANSACTION_CATEGORIES,
  getOrderTransactionAction,
  getOrderPaymentState,
} from '@helpers/partyOrderTransactions'
import {
  useCreatePartyTransactionMutation,
  useDeletePartyTransactionMutation,
  usePartyTransactionsQuery,
  useUpdatePartyTransactionMutation,
} from '@helpers/usePartyTransactionsQuery'
import { buildPartyOrderTransactionsViewModel } from './partyOrderTransactionViewModel'

const money = (value) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

const CATEGORY_LABELS = {
  deposit: 'Предоплата',
  final_payment: 'Остаток',
  client_payment: 'Оплата клиента',
  payout: 'Выплата',
  refund: 'Возврат',
  taxes: 'Налоги',
  materials: 'Материалы',
  travel: 'Дорога',
  other: 'Другое',
}

const PAYMENT_METHOD_LABELS = {
  transfer: 'Перевод',
  account: 'Расчетный счет',
  cash: 'Наличные',
  barter: 'Бартер',
}

const emptyDraft = (orderId) => ({
  _id: '',
  orderId,
  amount: '',
  type: 'income',
  category: 'deposit',
  paymentMethod: 'transfer',
  date: new Date().toISOString().slice(0, 10),
  comment: '',
})

const normalizeDraftForSubmit = (draft) => ({
  ...draft,
  amount: Number(draft.amount || 0),
  date: draft.date ? new Date(draft.date).toISOString() : new Date().toISOString(),
})

const TransactionList = ({ title, items, onEdit, onDelete }) => (
  <div className="rounded-md border border-gray-200 bg-white">
    <div className="border-b border-gray-100 px-3 py-2 text-sm font-semibold text-gray-800">
      {title}
    </div>
    {items.length === 0 ? (
      <div className="px-3 py-4 text-sm text-gray-400">Операций пока нет</div>
    ) : (
      <div className="divide-y divide-gray-100">
        {items.map((item) => (
          <div
            key={item._id}
            className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {money(item.amount)}
              </div>
              <div className="text-xs text-gray-500">
                {CATEGORY_LABELS[item.category] || item.category}
                {item.date ? ` · ${new Date(item.date).toLocaleDateString('ru-RU')}` : ''}
                {item.comment ? ` · ${item.comment}` : ''}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-sky-200 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                onClick={() => onEdit(item)}
              >
                Изменить
              </button>
              <button
                type="button"
                className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                onClick={() => onDelete(item)}
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)

export default function PartyOrderTransactionsSection({
  orderId,
  contractAmount = 0,
  isDraft = false,
  isClone = false,
  isFormChanged = false,
  onRequestAutosave,
}) {
  const [financeError, setFinanceError] = useState('')
  const [draft, setDraft] = useState(null)
  const transactionsQuery = usePartyTransactionsQuery(
    { orderId },
    { enabled: Boolean(orderId) }
  )
  const createMutation = useCreatePartyTransactionMutation()
  const updateMutation = useUpdatePartyTransactionMutation()
  const deleteMutation = useDeletePartyTransactionMutation()

  const transactions = useMemo(
    () => (Array.isArray(transactionsQuery.data) ? transactionsQuery.data : []),
    [transactionsQuery.data]
  )
  const viewModel = useMemo(
    () => buildPartyOrderTransactionsViewModel(transactions),
    [transactions]
  )
  const paymentState = useMemo(
    () => getOrderPaymentState({ contractAmount, transactions }),
    [contractAmount, transactions]
  )

  const startCreate = async () => {
    setFinanceError('')
    const action = getOrderTransactionAction({
      orderId,
      isClone,
      isDraft,
      isFormChanged,
    })
    if (action.type === 'blocked') {
      setFinanceError(action.error)
      return
    }
    let targetOrderId = orderId
    if (action.type === 'autosave-before-open') {
      if (typeof onRequestAutosave !== 'function') {
        setFinanceError('Сначала сохраните заказ')
        return
      }
      targetOrderId = await onRequestAutosave()
      if (!targetOrderId) {
        setFinanceError('Не удалось сохранить заказ перед транзакцией')
        return
      }
    }
    setDraft(emptyDraft(targetOrderId))
  }

  const saveDraft = async () => {
    if (!draft?.orderId) {
      setFinanceError('Сначала сохраните заказ')
      return
    }
    if (Number(draft.amount || 0) <= 0) {
      setFinanceError('Укажите сумму транзакции')
      return
    }
    setFinanceError('')
    const payload = normalizeDraftForSubmit(draft)
    if (draft._id) {
      await updateMutation.mutateAsync(payload)
    } else {
      await createMutation.mutateAsync(payload)
    }
    setDraft(null)
  }

  const deleteTransaction = async (item) => {
    const confirmed = window.confirm('Удалить транзакцию?')
    if (!confirmed) return
    await deleteMutation.mutateAsync(item)
  }

  const busy =
    transactionsQuery.isLoading ||
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2">
          <div className="text-xs text-emerald-700">Получено</div>
          <div className="text-sm font-bold text-emerald-900">
            {money(paymentState.incomeTotal)}
          </div>
        </div>
        <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2">
          <div className="text-xs text-amber-700">Остаток</div>
          <div className="text-sm font-bold text-amber-900">
            {money(paymentState.balanceDue)}
          </div>
        </div>
        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2">
          <div className="text-xs text-red-700">Расходы</div>
          <div className="text-sm font-bold text-red-900">
            {money(paymentState.expenseTotal)}
          </div>
        </div>
        <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2">
          <div className="text-xs text-sky-700">Маржа</div>
          <div className="text-sm font-bold text-sky-900">
            {money(paymentState.margin)}
          </div>
        </div>
      </div>

      {financeError ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {financeError}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-gray-500">
          Статус: <span className="font-semibold">{paymentState.status}</span>
        </div>
        <button
          type="button"
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          onClick={startCreate}
          disabled={busy}
        >
          Добавить транзакцию
        </button>
      </div>

      {draft ? (
        <div className="grid gap-2 rounded-md border border-sky-100 bg-sky-50 p-3 md:grid-cols-2">
          <select
            className="rounded border border-gray-200 bg-white px-2 py-2 text-sm"
            value={draft.type}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                type: e.target.value,
                category: e.target.value === 'expense' ? 'other' : 'deposit',
              }))
            }
          >
            <option value="income">Поступление</option>
            <option value="expense">Расход</option>
          </select>
          <select
            className="rounded border border-gray-200 bg-white px-2 py-2 text-sm"
            value={draft.category}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, category: e.target.value }))
            }
          >
            {PARTY_ORDER_TRANSACTION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category] || category}
              </option>
            ))}
          </select>
          <input
            className="rounded border border-gray-200 bg-white px-2 py-2 text-sm"
            type="number"
            min="0"
            placeholder="Сумма"
            value={draft.amount}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, amount: e.target.value }))
            }
          />
          <input
            className="rounded border border-gray-200 bg-white px-2 py-2 text-sm"
            type="date"
            value={draft.date}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, date: e.target.value }))
            }
          />
          <select
            className="rounded border border-gray-200 bg-white px-2 py-2 text-sm"
            value={draft.paymentMethod}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, paymentMethod: e.target.value }))
            }
          >
            {PARTY_ORDER_PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method] || method}
              </option>
            ))}
          </select>
          <input
            className="rounded border border-gray-200 bg-white px-2 py-2 text-sm"
            placeholder="Комментарий"
            value={draft.comment}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, comment: e.target.value }))
            }
          />
          <div className="flex gap-2 md:col-span-2">
            <button
              type="button"
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              onClick={saveDraft}
              disabled={busy}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              onClick={() => setDraft(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {busy && <p className="text-sm text-gray-500">Обновляем транзакции...</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <TransactionList
          title={`Поступления · ${money(viewModel.incomeTotal)}`}
          items={viewModel.income}
          onEdit={(item) =>
            setDraft({
              ...item,
              date: item.date ? item.date.slice(0, 10) : '',
            })
          }
          onDelete={deleteTransaction}
        />
        <TransactionList
          title={`Расходы · ${money(viewModel.expenseTotal)}`}
          items={viewModel.expense}
          onEdit={(item) =>
            setDraft({
              ...item,
              date: item.date ? item.date.slice(0, 10) : '',
            })
          }
          onDelete={deleteTransaction}
        />
      </div>
    </div>
  )
}
