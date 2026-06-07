export const PARTY_ORDER_TRANSACTION_TYPES = Object.freeze(['income', 'expense'])

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

export const PARTY_ORDER_PAYMENT_METHODS = Object.freeze([
  'transfer',
  'account',
  'cash',
  'barter',
])

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
  if (isDraft) {
    return { type: 'blocked', error: 'Для черновика транзакции недоступны' }
  }
  if (!orderId || isFormChanged) {
    return { type: 'autosave-before-open' }
  }
  return { type: 'open' }
}
