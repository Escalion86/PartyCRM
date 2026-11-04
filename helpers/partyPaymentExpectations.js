import { partyBookingFailure, partyMoneyKopecks } from './partyOrderBooking.js'
import {
  PARTY_ORDER_PAYMENT_METHODS,
  PARTY_ORDER_TRANSACTION_CATEGORY_LABELS,
} from './partyOrderTransactions.js'
import { parsePartyIsoDate } from './partyIsoDate.js'

export const PARTY_EXPECTATION_STATUSES = Object.freeze({
  pending: 'Ожидаем',
  completed: 'Исполнена',
  canceled: 'Отменена',
})
export const normalizePartyPaymentExpectation = (body) => {
  if (!['income', 'expense'].includes(body.type))
    partyBookingFailure('Выберите поступление или расход')
  const categories =
    body.type === 'income'
      ? ['deposit', 'final_payment', 'client_payment']
      : ['payout', 'refund', 'taxes', 'materials', 'travel', 'other']
  if (
    !categories.includes(body.category) ||
    !PARTY_ORDER_PAYMENT_METHODS.includes(body.paymentMethod)
  )
    partyBookingFailure('Выберите категорию и способ оплаты')
  const amountKopecks = partyMoneyKopecks(body.amount)
  const dueAt = parsePartyIsoDate(body.dueAt)
  if (!amountKopecks || !dueAt || !Number.isFinite(+dueAt))
    partyBookingFailure('Укажите положительную сумму и крайний срок ожидания')
  if (
    body.comment !== undefined &&
    (typeof body.comment !== 'string' || body.comment.length > 1000)
  )
    partyBookingFailure('Комментарий — не более 1000 символов')
  const staffId =
    body.type === 'expense' && body.category === 'payout' ? body.staffId : null
  if (
    (staffId && !/^[a-f\d]{24}$/i.test(staffId)) ||
    (body.category === 'payout' && !staffId)
  )
    partyBookingFailure('Выберите исполнителя для ожидаемой выплаты')
  return {
    type: body.type,
    category: body.category,
    amountKopecks,
    dueAt,
    paymentMethod: body.paymentMethod,
    comment: body.comment?.trim() || '',
    staffId,
  }
}
export const serializePartyPaymentExpectation = (record, now = new Date()) => {
  const remainingKopecks = Math.max(
    0,
    record.amountKopecks - record.paidKopecks
  )
  return {
    _id: String(record._id),
    orderId: String(record.orderId),
    type: record.type,
    category: record.category,
    staffId: record.staffId ? String(record.staffId) : null,
    amount: record.amountKopecks / 100,
    paid: record.paidKopecks / 100,
    remaining: remainingKopecks / 100,
    dueAt: new Date(record.dueAt).toISOString(),
    paymentMethod: record.paymentMethod,
    comment: record.comment || '',
    status: record.status,
    overdue:
      record.status === 'pending' &&
      remainingKopecks > 0 &&
      +new Date(record.dueAt) < +now,
    revision: record.revision,
    fulfillments: (record.fulfillments || []).map((item) => ({
      transactionId: String(item.transactionId),
      amount: item.amountKopecks / 100,
      date: new Date(item.date).toISOString(),
    })),
  }
}
export const partyExpectationLabel = (expectation) =>
  PARTY_ORDER_TRANSACTION_CATEGORY_LABELS[expectation.category] || 'Платёж'
