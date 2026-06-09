export const PARTY_ORDER_TRANSACTION_TYPES = Object.freeze(['income', 'expense'])

export const PARTY_ORDER_TRANSACTION_TYPE_LABELS = Object.freeze({
  income: 'Поступление',
  expense: 'Расход',
})

export const PARTY_ORDER_TRANSACTION_CATEGORIES = Object.freeze([
  'deposit',
  'final_payment',
  'client_payment',
  'payout',
  'refund',
  'taxes',
  'materials',
  'travel',
  'other',
])

export const PARTY_ORDER_INCOME_TRANSACTION_CATEGORIES = Object.freeze([
  'deposit',
  'final_payment',
  'client_payment',
])

export const PARTY_ORDER_EXPENSE_TRANSACTION_CATEGORIES = Object.freeze([
  'payout',
  'refund',
  'taxes',
  'materials',
  'travel',
  'other',
])

export const PARTY_ORDER_TRANSACTION_CATEGORY_LABELS = Object.freeze({
  deposit: 'Предоплата',
  final_payment: 'Остаток оплаты',
  client_payment: 'Оплата клиента',
  payout: 'Выплата исполнителю',
  refund: 'Возврат клиенту',
  taxes: 'Налоги',
  materials: 'Материалы',
  travel: 'Дорога',
  other: 'Другое',
})

export const PARTY_ORDER_PAYMENT_METHODS = Object.freeze([
  'transfer',
  'account',
  'cash',
  'barter',
])

export const PARTY_ORDER_PAYMENT_METHOD_LABELS = Object.freeze({
  transfer: 'Перевод',
  account: 'Расчетный счет',
  cash: 'Наличные',
  barter: 'Бартер',
})

export const PARTY_ORDER_PAYMENT_STATUS_LABELS = Object.freeze({
  none: 'Нет оплаты',
  wait_prepayment: 'Ждет предоплату',
  prepaid: 'Предоплата внесена',
  paid: 'Оплачено',
})

export const PARTY_ORDER_PAYOUT_STATUSES = Object.freeze([
  'planned',
  'ready',
  'paid',
  'canceled',
])

export const PARTY_ORDER_PAYOUT_STATUS_LABELS = Object.freeze({
  planned: 'Запланировано',
  ready: 'Готово к выплате',
  paid: 'Выплачено',
  canceled: 'Отменено',
})

export const normalizePartyPayoutStatus = (status) =>
  PARTY_ORDER_PAYOUT_STATUSES.includes(status) ? status : 'planned'

export const getPartyPayoutStatusLabel = (status) =>
  PARTY_ORDER_PAYOUT_STATUS_LABELS[normalizePartyPayoutStatus(status)]

export const getOrderPaymentStatusLabel = (status) =>
  PARTY_ORDER_PAYMENT_STATUS_LABELS[status] || String(status || '')

export const getPartyTransactionCategoryOptions = (type = 'income') => {
  const categories =
    type === 'expense'
      ? PARTY_ORDER_EXPENSE_TRANSACTION_CATEGORIES
      : PARTY_ORDER_INCOME_TRANSACTION_CATEGORIES

  return categories.map((value) => ({
    value,
    label: PARTY_ORDER_TRANSACTION_CATEGORY_LABELS[value] || value,
  }))
}

export const normalizeOrderTransactions = (items = []) =>
  Array.isArray(items) ? items.filter(Boolean) : []

export const splitOrderTransactions = (items = []) => {
  const transactions = normalizeOrderTransactions(items)
  return {
    income: transactions.filter((item) => item.type === 'income'),
    expense: transactions.filter((item) => item.type === 'expense'),
  }
}

const sumAmounts = (items = []) =>
  items.reduce((sum, item) => {
    const amount = Number(item?.amount || 0)
    return Number.isFinite(amount) ? sum + amount : sum
  }, 0)

export const getOrderTransactionTotals = (items = []) => {
  const { income, expense } = splitOrderTransactions(items)
  const incomeTotal = sumAmounts(income)
  const expenseTotal = sumAmounts(expense)
  return {
    incomeTotal,
    expenseTotal,
    margin: incomeTotal - expenseTotal,
  }
}

export const hasDepositTransaction = (items = []) =>
  normalizeOrderTransactions(items).some(
    (item) =>
      item?.type === 'income' &&
      ['deposit', 'client_payment'].includes(String(item?.category || '')) &&
      Number(item?.amount || 0) > 0
  )

export const getOrderPaymentState = ({
  contractAmount = 0,
  transactions = [],
} = {}) => {
  const safeContractAmount = Math.max(Number(contractAmount || 0), 0)
  const { incomeTotal, expenseTotal, margin } =
    getOrderTransactionTotals(transactions)
  const balanceDue = Math.max(safeContractAmount - incomeTotal, 0)
  const hasDeposit = hasDepositTransaction(transactions)
  const status =
    safeContractAmount <= 0 && incomeTotal <= 0
      ? 'none'
      : balanceDue <= 0
        ? 'paid'
        : hasDeposit
          ? 'prepaid'
          : 'wait_prepayment'

  return {
    contractAmount: safeContractAmount,
    incomeTotal,
    expenseTotal,
    margin,
    balanceDue,
    status,
    hasDeposit,
  }
}

export const getOrderTransactionAction = ({
  orderId,
  isClone = false,
  isDraft = false,
  isFormChanged = false,
} = {}) => {
  if (isClone) {
    return {
      type: 'blocked',
      error: 'В копии транзакции недоступны до сохранения',
    }
  }
  if (!orderId || isFormChanged) {
    return { type: 'autosave-before-open' }
  }
  return { type: 'open' }
}
