'use client'

import { useMemo, useState } from 'react'
import {
  PARTY_ORDER_PAYMENT_METHODS,
  PARTY_ORDER_PAYMENT_METHOD_LABELS,
  PARTY_ORDER_TRANSACTION_CATEGORY_LABELS,
  PARTY_ORDER_TRANSACTION_TYPE_LABELS,
  getPartyTransactionCategoryOptions,
  getOrderTransactionAction,
  getOrderPaymentStatusLabel,
  getOrderPaymentState,
} from '@helpers/partyOrderTransactions'
import {
  useCreatePartyTransactionMutation,
  useDeletePartyTransactionMutation,
  usePartyTransactionsQuery,
  useUpdatePartyTransactionMutation,
} from '@helpers/usePartyTransactionsQuery'
import Modal from '@components/Modal'
import Input from '@components/Input'
import Select from '@components/Select'
import { buildPartyOrderTransactionsViewModel } from './partyOrderTransactionViewModel'
import useUnsavedChanges from '@helpers/useUnsavedChanges'

const money = (value) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

const emptyDraft = (orderId) => ({
  _id: '',
  orderId,
  amount: '',
  type: 'income',
  category: 'deposit',
  staffId: '',
  paymentMethod: 'transfer',
  date: new Date().toISOString().slice(0, 10),
  comment: '',
})

const normalizeDraftForSubmit = (draft) => ({
  ...draft,
  amount: Number(draft.amount || 0),
  date: draft.date
    ? new Date(draft.date).toISOString()
    : new Date().toISOString(),
  staffId: draft.category === 'payout' ? draft.staffId || null : null,
})

const transactionTypeOptions = [
  {
    value: 'income',
    label: PARTY_ORDER_TRANSACTION_TYPE_LABELS.income,
  },
  {
    value: 'expense',
    label: PARTY_ORDER_TRANSACTION_TYPE_LABELS.expense,
  },
]

const paymentMethodOptions = PARTY_ORDER_PAYMENT_METHODS.map((method) => ({
  value: method,
  label: PARTY_ORDER_PAYMENT_METHOD_LABELS[method] || method,
}))

const TransactionList = ({
  title,
  items,
  isClosed,
  staffById,
  onEdit,
  onDelete,
}) => (
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
                {PARTY_ORDER_TRANSACTION_CATEGORY_LABELS[item.category] ||
                  item.category}
                {item.staffId && staffById.get(String(item.staffId))
                  ? ` · ${staffById.get(String(item.staffId))}`
                  : ''}
                {item.date
                  ? ` · ${new Date(item.date).toLocaleDateString('ru-RU')}`
                  : ''}
                {item.comment ? ` · ${item.comment}` : ''}
              </div>
            </div>
            {!isClosed ? (
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
            ) : null}
          </div>
        ))}
      </div>
    )}
  </div>
)

export default function PartyOrderTransactionsSection({
  orderId,
  activeCompanyId = '',
  contractAmount = 0,
  isDraft = false,
  isClone = false,
  isFormChanged = false,
  isClosed = false,
  assignedStaff = [],
  staff = [],
  onRequestAutosave,
}) {
  const [financeError, setFinanceError] = useState('')
  const [draft, setDraft] = useState(null)
  const hasUnsavedChanges = useUnsavedChanges(draft, Boolean(draft))
  const transactionsQuery = usePartyTransactionsQuery(
    { orderId, activeCompanyId },
    { enabled: Boolean(orderId) }
  )
  const createMutation = useCreatePartyTransactionMutation(activeCompanyId)
  const updateMutation = useUpdatePartyTransactionMutation(activeCompanyId)
  const deleteMutation = useDeletePartyTransactionMutation(activeCompanyId)

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
  const categoryOptions = useMemo(
    () => getPartyTransactionCategoryOptions(draft?.type || 'income'),
    [draft?.type]
  )
  const staffById = useMemo(
    () =>
      new Map(
        (Array.isArray(staff) ? staff : []).map((person) => [
          String(person._id),
          [person.secondName, person.firstName].filter(Boolean).join(' ') ||
            person.phone ||
            person.email ||
            'Без имени',
        ])
      ),
    [staff]
  )
  const assignedStaffIds = useMemo(
    () =>
      new Set(
        (Array.isArray(assignedStaff) ? assignedStaff : [])
          .map((assignment) => String(assignment?.staffId || ''))
          .filter(Boolean)
      ),
    [assignedStaff]
  )
  const staffOptions = useMemo(
    () =>
      (Array.isArray(assignedStaff) ? assignedStaff : [])
        .map((assignment) => {
          const staffId = String(assignment?.staffId || '')
          if (!staffId) return null
          return {
            value: staffId,
            label: staffById.get(staffId) || 'Исполнитель',
          }
        })
        .filter(Boolean),
    [assignedStaff, staffById]
  )

  const startCreate = async () => {
    setFinanceError('')
    if (isClosed) {
      setFinanceError(
        'Закрытый заказ: транзакции доступны только для просмотра'
      )
      return
    }
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

  const startEdit = (item) => {
    setFinanceError('')
    setDraft({
      ...item,
      date: item.date ? item.date.slice(0, 10) : '',
    })
  }

  const closeDraftEditor = () => {
    setDraft(null)
    setFinanceError('')
  }

  const saveDraft = async () => {
    if (isClosed) {
      setFinanceError(
        'Закрытый заказ: транзакции доступны только для просмотра'
      )
      setDraft(null)
      return
    }
    if (!draft?.orderId) {
      setFinanceError('Сначала сохраните заказ')
      return
    }
    if (Number(draft.amount || 0) <= 0) {
      setFinanceError('Укажите сумму транзакции')
      return
    }
    if (
      draft.type === 'expense' &&
      draft.category === 'payout' &&
      !draft.staffId
    ) {
      setFinanceError('Выберите исполнителя')
      return
    }
    if (
      draft.type === 'expense' &&
      draft.category === 'payout' &&
      !assignedStaffIds.has(String(draft.staffId))
    ) {
      setFinanceError('Выберите исполнителя из назначенных в заказе')
      return
    }
    setFinanceError('')
    const payload = normalizeDraftForSubmit(draft)
    if (draft._id) {
      await updateMutation.mutateAsync(payload)
    } else {
      await createMutation.mutateAsync(payload)
    }
    closeDraftEditor()
  }

  const deleteTransaction = async (item) => {
    if (isClosed) {
      setFinanceError(
        'Закрытый заказ: транзакции доступны только для просмотра'
      )
      return
    }
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
      {financeError ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {financeError}
        </div>
      ) : null}
      {isClosed && !financeError ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          Закрытый заказ: транзакции доступны только для просмотра
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-gray-500">
          Статус:{' '}
          <span className="font-semibold">
            {getOrderPaymentStatusLabel(paymentState.status)}
          </span>
        </div>
        <button
          type="button"
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          onClick={startCreate}
          disabled={busy || isClosed}
        >
          Добавить транзакцию
        </button>
      </div>

      {busy && <p className="text-sm text-gray-500">Обновляем транзакции...</p>}

      <div className="grid gap-3 md:grid-cols-2">
        <TransactionList
          title={`Поступления · ${money(viewModel.incomeTotal)}`}
          items={viewModel.income}
          isClosed={isClosed}
          staffById={staffById}
          onEdit={startEdit}
          onDelete={deleteTransaction}
        />
        <TransactionList
          title={`Расходы · ${money(viewModel.expenseTotal)}`}
          items={viewModel.expense}
          isClosed={isClosed}
          staffById={staffById}
          onEdit={startEdit}
          onDelete={deleteTransaction}
        />
      </div>

      <Modal
        open={Boolean(draft)}
        title={draft?._id ? 'Редактировать транзакцию' : 'Добавить транзакцию'}
        tone="party"
        size="lg"
        onClose={closeDraftEditor}
        hasUnsavedChanges={hasUnsavedChanges}
        footer={({ requestClose }) => (
          <>
            <button
              type="button"
              className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              onClick={requestClose}
            >
              Отмена
            </button>
            <button
              type="button"
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              onClick={saveDraft}
              disabled={busy}
            >
              Сохранить
            </button>
          </>
        )}
      >
        {draft ? (
          <div className="flex flex-col gap-3">
            {financeError ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {financeError}
              </div>
            ) : null}
            <div className="grid gap-x-3 gap-y-4 md:grid-cols-2">
              <Select
                label="Тип"
                value={draft.type}
                onChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    type: value,
                    category:
                      getPartyTransactionCategoryOptions(value)[0]?.value,
                    staffId: '',
                  }))
                }
                options={transactionTypeOptions}
                fullWidth
                noMargin
                tone="party"
              />
              <Select
                label="Категория"
                value={draft.category}
                onChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    category: value,
                    staffId: value === 'payout' ? prev.staffId : '',
                  }))
                }
                options={categoryOptions}
                fullWidth
                noMargin
                tone="party"
              />
              {draft.type === 'expense' && draft.category === 'payout' ? (
                <Select
                  label="Исполнитель"
                  value={draft.staffId || ''}
                  onChange={(value) =>
                    setDraft((prev) => ({ ...prev, staffId: value }))
                  }
                  options={staffOptions}
                  placeholder="Выберите исполнителя"
                  fullWidth
                  noMargin
                  tone="party"
                />
              ) : null}
              <Input
                label="Сумма"
                type="number"
                value={draft.amount}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, amount: value }))
                }
                min={0}
                step={1000}
                noMargin
                tone="party"
                postfix="₽"
              />
              <Input
                label="Дата"
                type="date"
                value={draft.date}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, date: value }))
                }
                fullWidth
                noMargin
                tone="party"
              />
              <Select
                label="Способ оплаты"
                value={draft.paymentMethod}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, paymentMethod: value }))
                }
                options={paymentMethodOptions}
                fullWidth
                noMargin
                tone="party"
              />
              <Input
                label="Комментарий"
                value={draft.comment}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, comment: value }))
                }
                className="md:col-span-2"
                fullWidth
                noMargin
                tone="party"
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
