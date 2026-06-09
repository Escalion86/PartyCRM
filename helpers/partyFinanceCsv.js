import {
  PARTY_ORDER_PAYMENT_METHOD_LABELS,
  PARTY_ORDER_TRANSACTION_CATEGORY_LABELS,
  PARTY_ORDER_TRANSACTION_TYPE_LABELS,
} from './partyOrderTransactions.js'

const CSV_COLUMNS = Object.freeze([
  'Дата заказа',
  'Заказ',
  'Клиент',
  'Сумма договора',
  'Дата операции',
  'Тип',
  'Категория',
  'Сумма операции',
  'Способ оплаты',
  'Комментарий',
])

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU')
}

const csvCell = (value) => {
  const text = String(value ?? '')
  if (/[,;"\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

const buildOrderTransactionRows = (order) => {
  const transactions = Array.isArray(order?.transactions)
    ? order.transactions
    : []
  if (transactions.length === 0) {
    return [
      [
        formatDate(order?.eventDate),
        order?.title || order?.serviceTitle || 'Заказ',
        order?.client?.name || '',
        Number(order?.contractAmount ?? order?.clientPayment?.totalAmount ?? 0),
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ]
  }

  return transactions.map((transaction) => [
    formatDate(order?.eventDate),
    order?.title || order?.serviceTitle || 'Заказ',
    order?.client?.name || '',
    Number(order?.contractAmount ?? order?.clientPayment?.totalAmount ?? 0),
    formatDate(transaction?.date),
    PARTY_ORDER_TRANSACTION_TYPE_LABELS[transaction?.type] || transaction?.type,
    PARTY_ORDER_TRANSACTION_CATEGORY_LABELS[transaction?.category] ||
      transaction?.category,
    Number(transaction?.amount || 0),
    PARTY_ORDER_PAYMENT_METHOD_LABELS[transaction?.paymentMethod] ||
      transaction?.paymentMethod,
    transaction?.comment || '',
  ])
}

export const filterPartyOrdersByEventPeriod = (
  orders = [],
  { dateFrom = '', dateTo = '' } = {}
) => {
  return orders.filter((order) => {
    if (!order?.eventDate) return false
    const date = new Date(order.eventDate)
    if (Number.isNaN(date.getTime())) return false
    const dateKey = date.toISOString().slice(0, 10)
    if (dateFrom && dateKey < dateFrom) return false
    if (dateTo && dateKey > dateTo) return false
    return true
  })
}

export const buildPartyFinanceCsv = (orders = []) => {
  const rows = [
    CSV_COLUMNS,
    ...orders.flatMap((order) => buildOrderTransactionRows(order)),
  ]
  return rows.map((row) => row.map(csvCell).join(';')).join('\n')
}
