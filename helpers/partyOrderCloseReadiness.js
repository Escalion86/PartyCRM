import { getOrderPaymentState } from './partyOrderTransactions.js'

const hasAmount = (value) => Number(value || 0) > 0

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
  }
}
