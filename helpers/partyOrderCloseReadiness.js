import {
  getOrderPaymentState,
  getOrderNonPayoutExpenseTotal,
  getPartyOrderPayoutSummary,
} from './partyOrderTransactions.js'

const getPartyOrderCloseSummary = ({ order = {}, paymentState } = {}) => {
  const payoutSummary = getPartyOrderPayoutSummary({
    order,
    transactions: paymentState.transactions,
  })
  const nonPayoutExpenseTotal = getOrderNonPayoutExpenseTotal(
    paymentState.transactions
  )

  return {
    contractAmount: paymentState.contractAmount,
    incomeTotal: paymentState.incomeTotal,
    expenseTotal: paymentState.expenseTotal,
    balanceDue: paymentState.balanceDue,
    paymentStatus: paymentState.status,
    payoutTotal: payoutSummary.payoutTotal,
    paidPayoutTotal: payoutSummary.paidPayoutTotal,
    unpaidPayoutTotal: payoutSummary.unpaidPayoutTotal,
    unpaidPayoutCount: payoutSummary.unpaidPayoutCount,
    payoutStatus: payoutSummary.payoutStatus,
    grossMargin:
      paymentState.incomeTotal -
      nonPayoutExpenseTotal -
      payoutSummary.payoutTotal,
  }
}

export const getPartyOrderCloseReadiness = ({
  order = {},
  transactions = [],
} = {}) => {
  const paymentState = getOrderPaymentState({
    contractAmount: order.contractAmount ?? order.clientPayment?.totalAmount,
    transactions: Array.isArray(transactions) ? transactions : [],
  })
  const sourceTransactions = Array.isArray(transactions) ? transactions : []
  const payoutSummary = getPartyOrderPayoutSummary({
    order,
    transactions: sourceTransactions,
  })
  const openTasks = (order.additionalEvents ?? []).filter((item) => !item?.done)
  const blockers = []

  if (paymentState.balanceDue > 0) {
    blockers.push({
      code: 'client_debt',
      message: `Остаток оплаты клиента: ${paymentState.balanceDue}`,
    })
  }

  if (payoutSummary.unpaidPayoutCount > 0) {
    blockers.push({
      code: 'unpaid_payouts',
      message: `Невыплаченные исполнители: ${payoutSummary.unpaidPayoutCount}`,
    })
  }

  if (openTasks.length > 0) {
    blockers.push({
      code: 'open_tasks',
      message: `Открытые задачи: ${openTasks.length}`,
    })
  }

  return {
    ok: blockers.length === 0,
    blockers,
    summary: getPartyOrderCloseSummary({
      order,
      paymentState: { ...paymentState, transactions: sourceTransactions },
    }),
  }
}
