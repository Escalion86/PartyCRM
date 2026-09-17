import { createHash } from 'node:crypto'
import { Types } from 'mongoose'
import { getPartyOrderModel, getPartyTransactionModel, getPartyStaffModel, getPartyClientModel } from './partyModels'
import { getPartyLegacyLedgerMigrationModel } from './partyLegacyLedgerModels'
import { withPartyFinancialTransaction } from './partyFinancialSettlements'

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status, code: 'partycrm_legacy_ledger_error' }) }
const validId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''))
const stable = (value) => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : 'Invalid Date'
  if (value?.toHexString) return value.toHexString()
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  return value
}
const fingerprintFor = (order) => createHash('sha256').update(JSON.stringify(stable({
  tenantId: order.tenantId, orderId: order._id, status: order.status,
  clientId: order.clientId || null, revision: order.sharedLocationRevision || 0, transactions: order.transactions,
}))).digest('hex')

export const previewPartyLegacyEntries = (order) => {
  const issues = [], entries = [], totals = { incomeTotal: 0, expenseTotal: 0 }
  let income = 0n, expense = 0n
  const raw = order.transactions ?? []
  if (!Array.isArray(raw)) issues.push('Старый журнал имеет некорректный формат')
  for (const [index, row] of (Array.isArray(raw) ? raw : []).entries()) {
    const prefix = `Платёж ${index + 1}: `
    if (!row || typeof row !== 'object' || Array.isArray(row)) { issues.push(`${prefix}некорректная запись`); continue }
    const countBefore = issues.length
    const match = typeof row.amount === 'number' && Number.isFinite(row.amount) && /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(row.amount))
    const cents = match ? BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0')) : 0n
    if (!match || cents < 1n || cents > 100000000000000n) issues.push(`${prefix}сумма должна быть от 0,01 ₽ с точностью до копейки`)
    if (!['income', 'expense'].includes(row.type)) issues.push(`${prefix}не указан корректный тип`)
    if (!['deposit', 'final_payment', 'client_payment', 'payout', 'refund', 'taxes', 'materials', 'travel', 'other'].includes(row.category)) issues.push(`${prefix}не указана корректная категория`)
    if (!['transfer', 'account', 'cash', 'barter'].includes(row.paymentMethod)) issues.push(`${prefix}не указан корректный способ оплаты`)
    const date = row.date instanceof Date ? (Number.isFinite(row.date.getTime()) ? row.date.toISOString() : null) : row.date
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(date) || !Number.isFinite(Date.parse(date))) issues.push(`${prefix}не указана корректная дата`)
    else if (new Date(`${date.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== date.slice(0, 10)) issues.push(`${prefix}несуществующая дата`)
    if (row.comment != null && (typeof row.comment !== 'string' || row.comment.length > 1000 || row.comment !== row.comment.trim())) issues.push(`${prefix}комментарий нельзя перенести без изменения`)
    if (row.staffId != null && !validId(row.staffId)) issues.push(`${prefix}некорректный сотрудник`)
    if (issues.length !== countBefore) continue
    if (row.type === 'income') income += cents
    else expense += cents
    entries.push({ sourceIndex: index, sourceId: row._id ? String(row._id) : null, amount: row.amount, type: row.type, category: row.category, date: new Date(date).toISOString(), paymentMethod: row.paymentMethod, comment: row.comment || '', staffId: row.staffId ? String(row.staffId) : null })
  }
  if (income > 100000000000000n || expense > 100000000000000n) issues.push('Сумма журнала превышает безопасный предел')
  else { totals.incomeTotal = Number(income) / 100; totals.expenseTotal = Number(expense) / 100 }
  return { status: issues.length ? 'blocked' : entries.length ? 'ready' : 'empty', fingerprint: fingerprintFor(order), entries, totals, issues }
}

const load = async ({ tenantId, orderId, session = null }) => {
  const [Orders, Transactions, Migrations, Staff, Clients] = await Promise.all([getPartyOrderModel(), getPartyTransactionModel(), getPartyLegacyLedgerMigrationModel(), getPartyStaffModel(), getPartyClientModel()])
  const order = await Orders.findOne({ tenantId, _id: orderId }).session(session).lean()
  if (!order) fail('Заказ не найден', 404)
  if (order.legacyLedgerMigrationId) {
    const receipt = await Migrations.findOne({ tenantId, orderId, _id: order.legacyLedgerMigrationId }).session(session).lean()
    if (!receipt) fail('Не найдена сохранённая квитанция переноса')
    return { order, preview: { ...receipt.receipt, status: 'migrated' }, Orders, Transactions, Migrations }
  }
  const preview = previewPartyLegacyEntries(order)
  if (!['draft', 'active', 'closed', 'canceled'].includes(order.status)) preview.issues.push('Некорректный статус заказа')
  const existing = await Transactions.findOne({ tenantId, orderId }).session(session).lean()
  if (existing && (order.transactions?.length || 0) > 0) preview.issues.push('Есть и старые, и новые платежи. Требуется ручная сверка; автоматический перенос запрещён')
  const staffIds = [...new Set(preview.entries.map((row) => row.staffId).filter(Boolean))]
  if (staffIds.length) {
    const staff = await Staff.find({ tenantId, _id: { $in: staffIds } }).session(session).lean()
    if (staff.length !== staffIds.length) preview.issues.push('Сотрудник старого платежа не найден в этой компании')
    const names = new Map(staff.map((row) => [String(row._id), [row.secondName, row.firstName, row.thirdName].filter(Boolean).join(' ') || row.name || row.fullName || '']))
    preview.entries = preview.entries.map((row) => ({ ...row, staffName: names.get(row.staffId) || '' }))
  }
  if (order.transactions?.length && order.clientId && (!validId(order.clientId) || !await Clients.findOne({ tenantId, _id: order.clientId }).session(session).lean())) preview.issues.push('Клиент заказа не найден в этой компании')
  if (preview.issues.length) preview.status = 'blocked'
  return { order, preview, Orders, Transactions, Migrations }
}

export const getPartyLegacyLedger = async (args) => (await load(args)).preview

export const migratePartyLegacyLedger = async ({ tenantId, orderId, expectedFingerprint, actorStaffId = null, actorUserId = null }) => {
  if (typeof expectedFingerprint !== 'string' || !/^[a-f\d]{64}$/.test(expectedFingerprint)) fail('Обновите предварительный просмотр перед переносом', 400)
  const Migrations = await getPartyLegacyLedgerMigrationModel()
  await Migrations.init()
  return withPartyFinancialTransaction(tenantId, async (session) => {
    const { order, preview, Orders, Transactions } = await load({ tenantId, orderId, session })
    if (preview.status === 'migrated') return { ...preview, replayed: true }
    if (preview.fingerprint !== expectedFingerprint) fail('Журнал изменился. Обновите предварительный просмотр')
    if (preview.status !== 'ready') fail(preview.issues.join('; ') || 'Нет платежей для переноса')
    const migrationId = new Types.ObjectId(), migratedAt = new Date()
    const entries = preview.entries.map((row) => ({ ...row, transactionId: String(new Types.ObjectId()) }))
    const receipt = { ...preview, entries, status: 'migrated', migrationId: String(migrationId), migratedAt }
    const rows = entries.map((row) => ({ _id: row.transactionId, tenantId, orderId, clientId: order.clientId || null, staffId: row.staffId, amount: row.amount, type: row.type, category: row.category, date: row.date, paymentMethod: row.paymentMethod, comment: row.comment }))
    await Transactions.insertMany(rows, { session, ordered: true })
    await Migrations.create([{ _id: migrationId, tenantId, orderId, fingerprint: preview.fingerprint, sourceEntries: order.transactions, receipt, actorStaffId, actorUserId }], { session, ordered: true })
    const changed = await Orders.updateOne({ tenantId, _id: orderId, legacyLedgerMigrationId: null, status: order.status }, { $set: { transactions: [], legacyLedgerMigrationId: migrationId, legacyLedgerMigratedAt: migratedAt }, $inc: { sharedLocationRevision: 1 } }, { session })
    if (changed.matchedCount !== 1) fail('Заказ изменился. Обновите предварительный просмотр')
    return { ...receipt, replayed: false }
  })
}
