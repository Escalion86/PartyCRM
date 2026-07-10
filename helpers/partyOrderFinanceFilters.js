import {
  getOrderPaymentState,
  getOrderNonPayoutExpenseTotal,
  getPartyOrderPayoutSummary,
} from './partyOrderTransactions.js'

export const getPartyOrderFinanceFlags = (order = {}) => {
  const paymentState = getOrderPaymentState({
    contractAmount: order.contractAmount ?? order.clientPayment?.totalAmount,
    transactions: Array.isArray(order.transactions) ? order.transactions : [],
  })
  const payoutSummary = getPartyOrderPayoutSummary({
    order,
    transactions: Array.isArray(order.transactions) ? order.transactions : [],
  })
  const transactions = Array.isArray(order.transactions) ? order.transactions : []
  const grossMargin =
    paymentState.incomeTotal -
    getOrderNonPayoutExpenseTotal(transactions) -
    payoutSummary.payoutTotal

  return {
    waitsPrepayment: paymentState.status === 'wait_prepayment',
    hasClientDebt: paymentState.balanceDue > 0 && paymentState.incomeTotal > 0,
    hasUnpaidPayouts: payoutSummary.unpaidPayoutCount > 0,
    hasNegativeMargin: grossMargin < 0,
  }
}

export const matchesPartyOrderFinanceFilter = (order = {}, filter = '') => {
  const flags = getPartyOrderFinanceFlags(order)
  switch (filter) {
    case 'finance_wait_prepayment':
      return flags.waitsPrepayment
    case 'finance_debt':
      return flags.hasClientDebt
    case 'finance_unpaid_payouts':
      return flags.hasUnpaidPayouts
    case 'finance_negative_margin':
      return flags.hasNegativeMargin
    default:
      return true
  }
}
