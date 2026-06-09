import { getOrderPaymentState } from './partyOrderTransactions.js'

const getPayoutTotal = (order = {}) =>
  (order.assignedStaff ?? []).reduce(
    (sum, item) => sum + Number(item?.payoutAmount || 0),
    0
  )

const hasUnpaidPayouts = (order = {}) =>
  (order.assignedStaff ?? []).some(
    (item) =>
      Number(item?.payoutAmount || 0) > 0 &&
      !['paid', 'canceled'].includes(item?.payoutStatus)
  )

export const getPartyOrderFinanceFlags = (order = {}) => {
  const paymentState = getOrderPaymentState({
    contractAmount: order.contractAmount ?? order.clientPayment?.totalAmount,
    transactions: Array.isArray(order.transactions) ? order.transactions : [],
  })
  const grossMargin = paymentState.margin - getPayoutTotal(order)

  return {
    waitsPrepayment: paymentState.status === 'wait_prepayment',
    hasClientDebt: paymentState.balanceDue > 0 && paymentState.incomeTotal > 0,
    hasUnpaidPayouts: hasUnpaidPayouts(order),
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
