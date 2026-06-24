import { getOrderPaymentState } from './partyOrderTransactions.js'

const hasAmount = (value) => Number(value || 0) > 0

const getPayoutItems = (order = {}) =>
  (order.assignedStaff ?? []).filter((item) => hasAmount(item?.payoutAmount))

const sumPayoutAmount = (items = []) =>
  items.reduce((sum, item) => sum + Number(item?.payoutAmount || 0), 0)

const getPartyOrderCloseSummary = ({ order = {}, paymentState } = {}) => {
  const payoutItems = getPayoutItems(order)
  const payablePayouts = payoutItems.filter(
    (item) => item?.payoutStatus !== 'canceled'
  )
  const paidPayouts = payablePayouts.filter(
    (item) => item?.payoutStatus === 'paid'
  )
  const unpaidPayouts = payablePayouts.filter(
    (item) => item?.payoutStatus !== 'paid'
  )
  const payoutTotal = sumPayoutAmount(payablePayouts)
  const paidPayoutTotal = sumPayoutAmount(paidPayouts)
  const unpaidPayoutTotal = sumPayoutAmount(unpaidPayouts)
  const payoutStatus =
    payoutTotal <= 0
      ? 'none'
      : unpaidPayouts.length <= 0
        ? 'paid'
        : paidPayoutTotal > 0
          ? 'partial'
          : 'unpaid'

  return {
    contractAmount: paymentState.contractAmount,
    incomeTotal: paymentState.incomeTotal,
    expenseTotal: paymentState.expenseTotal,
    balanceDue: paymentState.balanceDue,
    paymentStatus: paymentState.status,
    payoutTotal,
    paidPayoutTotal,
    unpaidPayoutTotal,
    unpaidPayoutCount: unpaidPayouts.length,
    payoutStatus,
    grossMargin:
      paymentState.incomeTotal - paymentState.expenseTotal - payoutTotal,
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
  const unpaidPayouts = (order.assignedStaff ?? []).filter(
    (item) =>
      hasAmount(item?.payoutAmount) &&
      !['paid', 'canceled'].includes(item?.payoutStatus)
  )
  const openTasks = (order.additionalEvents ?? []).filter((item) => !item?.done)
  const blockers = []

  if (paymentState.balanceDue > 0) {
    blockers.push({
      code: 'client_debt',
      message: `Остаток оплаты клиента: ${paymentState.balanceDue}`,
    })
  }

  if (unpaidPayouts.length > 0) {
    blockers.push({
      code: 'unpaid_payouts',
      message: `Невыплаченные исполнители: ${unpaidPayouts.length}`,
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
    summary: getPartyOrderCloseSummary({ order, paymentState }),
  }
}
