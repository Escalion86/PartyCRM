import { createHash } from 'node:crypto'
import { ticketDate, ticketFailure, ticketInteger, ticketText } from './partyTicketsCore.js'

export const ticketChannelIdentity = (value) => {
  const title = ticketText(value, 120).normalize('NFKC').replace(/\s+/gu, ' ')
  if (!title || /[\p{Cc}\p{Cf}]/u.test(title)) {
    ticketFailure('Укажите название канала продаж')
  }
  const normalized = title.toLocaleLowerCase('ru-RU')
  const key = createHash('sha256').update(normalized).digest('hex')
  return { channelKey: `manual:${key}`, channelTitle: title }
}

export const normalizeTicketChannelRecord = (payload, now) => {
  if (!['sale', 'refund'].includes(payload.kind)) {
    ticketFailure('Выберите продажу или возврат')
  }
  if (typeof payload.occurredAt !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(payload.occurredAt)) {
    ticketFailure('Укажите дату и время операции с часовым поясом')
  }
  const occurredAt = ticketDate(payload.occurredAt, true)
  if (+occurredAt > +now) ticketFailure('Дата операции ещё не наступила')
  const quantity = ticketInteger(payload.quantity, payload.kind === 'sale' ? 1 : 0, 100000)
  const amountKopecks = ticketInteger(payload.amountKopecks)
  if (!quantity && !amountKopecks) ticketFailure('Укажите количество или сумму возврата')
  const externalReference = ticketText(payload.externalReference || '', 180).normalize('NFKC')
  return {
    kind: payload.kind,
    occurredAt,
    quantity,
    amountKopecks,
    externalReference,
    ...(externalReference ? { externalReferenceKey: createHash('sha256').update(externalReference).digest('hex') } : {}),
    comment: ticketText(payload.comment || '', 1000),
  }
}

export const ticketChannelRecordDto = (row) => ({
  _id: String(row._id),
  sessionId: String(row.sessionId),
  channelKey: row.channelKey,
  channelTitle: row.channelTitle,
  kind: row.kind,
  occurredAt: row.occurredAt,
  quantity: row.quantity,
  amountKopecks: row.amountKopecks,
  externalReference: row.externalReference || '',
  comment: row.comment || '',
  saleRecordId: row.saleRecordId ? String(row.saleRecordId) : null,
  recordedByStaffId: String(row.recordedByStaffId),
  createdAt: row.createdAt,
  ...(row.kind === 'sale' ? {
    remainingQuantity: row.quantity - (row.refundedQuantity || 0),
    refundableAmountKopecks: row.amountKopecks - (row.refundedAmountKopecks || 0),
  } : {}),
})

export const DIRECT_CHANNEL_FIELDS = [
  'netQuantity', 'netAmountKopecks', 'refundedQuantity', 'refundedAmountKopecks',
  'unpaidQuantity', 'unpaidAmountKopecks', 'unclassifiedRefundQuantity',
  'unclassifiedRefundAmountKopecks', 'cashRefundedAmountKopecks',
]

// A partially paid group has no authoritative allocation to individual tickets.
// Only covered active tickets and provably paid cancellations enter sales totals.
export const directTicketChannelPipeline = (filter) => {
  const fields = ['quantity', 'refundedQuantity', 'totalAmountKopecks', 'paidAmountKopecks', 'refundedAmountKopecks', 'canceledValueKopecks']
  const covered = { $gte: ['$netPaid', '$activeValue'] }
  const returned = { $or: [
    { $gte: ['$paidAmountKopecks', '$totalAmountKopecks'] },
    { $gte: ['$refundedAmountKopecks', '$canceledValueKopecks'] },
  ] }
  return [
    { $match: filter },
    { $project: Object.fromEntries(fields.map((field) => [field, { $ifNull: [`$${field}`, 0] }])) },
    { $set: {
      activeQuantity: { $max: [{ $subtract: ['$quantity', '$refundedQuantity'] }, 0] },
      activeValue: { $max: [{ $subtract: ['$totalAmountKopecks', '$canceledValueKopecks'] }, 0] },
      netPaid: { $subtract: ['$paidAmountKopecks', '$refundedAmountKopecks'] },
    } },
    { $project: {
      netQuantity: { $cond: [covered, '$activeQuantity', 0] },
      netAmountKopecks: { $cond: [covered, '$activeValue', 0] },
      unpaidQuantity: { $cond: [covered, 0, '$activeQuantity'] },
      unpaidAmountKopecks: { $cond: [covered, 0, '$activeValue'] },
      refundedQuantity: { $cond: [returned, '$refundedQuantity', 0] },
      refundedAmountKopecks: { $cond: [returned, '$canceledValueKopecks', 0] },
      unclassifiedRefundQuantity: { $cond: [returned, 0, '$refundedQuantity'] },
      unclassifiedRefundAmountKopecks: { $cond: [returned, 0, '$canceledValueKopecks'] },
      cashRefundedAmountKopecks: '$refundedAmountKopecks',
    } },
    { $group: { _id: null, ...Object.fromEntries(DIRECT_CHANNEL_FIELDS.map((field) => [field, { $sum: `$${field}` }])) } },
  ]
}

export const externalTicketChannelPipeline = (filter) => [
  { $match: filter },
  { $sort: { _id: -1 } },
  { $group: {
    _id: '$channelKey',
    channelTitle: { $first: '$channelTitle' },
    soldQuantity: { $sum: { $cond: [{ $eq: ['$kind', 'sale'] }, '$quantity', 0] } },
    refundedQuantity: { $sum: { $cond: [{ $eq: ['$kind', 'refund'] }, '$quantity', 0] } },
    soldAmountKopecks: { $sum: { $cond: [{ $eq: ['$kind', 'sale'] }, '$amountKopecks', 0] } },
    refundedAmountKopecks: { $sum: { $cond: [{ $eq: ['$kind', 'refund'] }, '$amountKopecks', 0] } },
  } },
]

const sum = (values) => {
  const value = values.reduce((total, item) => total + Number(item || 0), 0)
  if (!Number.isSafeInteger(value) || value < 0) {
    ticketFailure('Суммы отчёта требуют проверки администратором', 409, 'partycrm_ticketing_channel_totals_invalid')
  }
  return value
}

export const buildTicketChannelSummary = ({ sessionId, capacity, direct = {}, external = [] }) => {
  const crm = {
    channelKey: 'crm', channelTitle: 'Прямые продажи CRM', source: 'crm',
    ...Object.fromEntries(DIRECT_CHANNEL_FIELDS.map((field) => [field, sum([direct[field]])])),
  }
  crm.soldQuantity = sum([crm.netQuantity, crm.refundedQuantity])
  crm.soldAmountKopecks = sum([crm.netAmountKopecks, crm.refundedAmountKopecks])
  const channels = [crm, ...external.map((row) => ({
    channelKey: String(row._id), channelTitle: row.channelTitle, source: 'manual',
    soldQuantity: sum([row.soldQuantity]), refundedQuantity: sum([row.refundedQuantity]),
    soldAmountKopecks: sum([row.soldAmountKopecks]), refundedAmountKopecks: sum([row.refundedAmountKopecks]),
    netQuantity: sum([row.soldQuantity - row.refundedQuantity]),
    netAmountKopecks: sum([row.soldAmountKopecks - row.refundedAmountKopecks]),
  })).sort((left, right) => left.channelTitle.localeCompare(right.channelTitle, 'ru'))]
  const totalFields = ['soldQuantity', 'refundedQuantity', 'netQuantity', 'soldAmountKopecks', 'refundedAmountKopecks', 'netAmountKopecks']
  const totals = Object.fromEntries(totalFields.map((field) => [field, sum(channels.map((row) => row[field]))]))
  return {
    sessionId: String(sessionId), capacity, channels, totals,
    unpaidQuantity: crm.unpaidQuantity, unpaidAmountKopecks: crm.unpaidAmountKopecks,
    unclassifiedRefundQuantity: crm.unclassifiedRefundQuantity,
    unclassifiedRefundAmountKopecks: crm.unclassifiedRefundAmountKopecks,
    overCapacityQuantity: Math.max(totals.netQuantity + crm.unpaidQuantity - capacity, 0),
    inventorySynced: false, bankSettlementsVerified: false,
  }
}
