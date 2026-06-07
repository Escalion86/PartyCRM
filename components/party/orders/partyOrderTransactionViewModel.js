const toTime = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0
}

const sortByDateDesc = (items = []) =>
  [...items].sort((a, b) => toTime(b.date) - toTime(a.date))

const sumAmounts = (items = []) =>
  items.reduce((sum, item) => {
    const amount = Number(item?.amount || 0)
    return Number.isFinite(amount) ? sum + amount : sum
  }, 0)

export const buildPartyOrderTransactionsViewModel = (transactions = []) => {
  const safeTransactions = Array.isArray(transactions)
    ? transactions.filter(Boolean)
    : []
  const income = sortByDateDesc(
    safeTransactions.filter((item) => item.type === 'income')
  )
  const expense = sortByDateDesc(
    safeTransactions.filter((item) => item.type === 'expense')
  )
  const incomeTotal = sumAmounts(income)
  const expenseTotal = sumAmounts(expense)

  return {
    income,
    expense,
    incomeTotal,
    expenseTotal,
    margin: incomeTotal - expenseTotal,
    hasTransactions: safeTransactions.length > 0,
  }
}
