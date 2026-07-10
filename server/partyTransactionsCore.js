import {
  PARTY_ORDER_PAYMENT_METHODS,
  PARTY_ORDER_TRANSACTION_CATEGORIES,
  PARTY_ORDER_TRANSACTION_TYPES,
} from '../helpers/partyOrderTransactions.js'

const OBJECT_ID_RE = /^[a-f\d]{24}$/i

const INCOME_CATEGORIES = new Set(['deposit', 'final_payment', 'client_payment'])
const EXPENSE_CATEGORIES = new Set([
  'payout',
  'refund',
  'taxes',
  'materials',
  'travel',
  'other',
])

const isValidObjectIdValue = (value) => OBJECT_ID_RE.test(String(value || ''))

const parseMoney = (value) => {
  if (value === null || value === undefined || value === '') return 0
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : 0
}

const parseDate = (value) => {
  if (!value) return new Date()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

const normalizeCategory = ({ type, category }) => {
  const value = String(category || '')
  if (!PARTY_ORDER_TRANSACTION_CATEGORIES.includes(value)) {
    return type === 'expense' ? 'other' : 'deposit'
  }
  if (type === 'expense') {
    return EXPENSE_CATEGORIES.has(value) ? value : 'other'
  }
  return INCOME_CATEGORIES.has(value) ? value : 'deposit'
}

export const normalizePartyTransactionPayload = (body = {}) => {
  const type = PARTY_ORDER_TRANSACTION_TYPES.includes(body.type)
    ? body.type
    : 'income'

  return {
    orderId: isValidObjectIdValue(body.orderId) ? String(body.orderId) : '',
    clientId: isValidObjectIdValue(body.clientId) ? String(body.clientId) : null,
    staffId:
      type === 'expense' &&
      normalizeCategory({ type, category: body.category }) === 'payout' &&
      isValidObjectIdValue(body.staffId)
        ? String(body.staffId)
        : null,
    amount: parseMoney(body.amount),
    type,
    category: normalizeCategory({ type, category: body.category }),
    date: parseDate(body.date),
    comment:
      typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '',
    paymentMethod: PARTY_ORDER_PAYMENT_METHODS.includes(body.paymentMethod)
      ? body.paymentMethod
      : 'transfer',
  }
}

export const serializePartyTransaction = (doc) => {
  if (!doc) return null
  const item = typeof doc.toObject === 'function' ? doc.toObject() : doc
  return {
    _id: String(item._id),
    tenantId: String(item.tenantId),
    orderId: String(item.orderId),
    clientId: item.clientId ? String(item.clientId) : null,
    staffId: item.staffId ? String(item.staffId) : null,
    amount: Number(item.amount || 0),
    type: item.type || 'income',
    category: item.category || 'deposit',
    date: item.date ? new Date(item.date).toISOString() : null,
    comment: item.comment || '',
    paymentMethod: item.paymentMethod || 'transfer',
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
  }
}
