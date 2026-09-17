import { createHash } from 'node:crypto'
import { Types } from 'mongoose'
import { getPartyGroupPaymentModel } from './partyGroupPaymentModels'
import { getPartyEventGroupModel } from './partyEventGroupModels'
import { getPartyOrderModel, getPartyTransactionModel } from './partyModels'
import { withPartyFinancialTransaction } from './partyFinancialSettlements'

const fail = (message, status = 409) => {
  const error = new Error(message)
  error.status = status
  error.code = 'partycrm_group_payment_error'
  throw error
}
const validId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)
export const partyGroupPaymentCents = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('Укажите сумму числом', 400)
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
  if (!match) fail('Сумма должна содержать не более двух знаков после запятой', 400)
  const result = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'))
  // Bound the decimal round-trip to Number/rubles used by the existing ledger.
  if (!Number.isSafeInteger(result) || result < 100 || result > 100000000000000) fail('Сумма должна быть от 1 до 1 000 000 000 000 ₽', 400)
  return result
}
export const normalizePartyGroupPayment = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Некорректные данные', 400)
  if (typeof body.idempotencyKey !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.idempotencyKey)) fail('Некорректный ключ операции', 400)
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1) fail('Передайте версию группы', 400)
  const amountCents = partyGroupPaymentCents(body.amount)
  if (!Array.isArray(body.allocations) || body.allocations.length < 2 || body.allocations.length > 20) fail('Распределите платеж между 2–20 заказами', 400)
  const allocations = body.allocations.map((part) => {
    if (!validId(part?.orderId)) fail('Некорректный заказ', 400)
    return { orderId: part.orderId.toLowerCase(), amountCents: partyGroupPaymentCents(part.amount) }
  }).sort((a, b) => a.orderId.localeCompare(b.orderId))
  if (new Set(allocations.map((part) => part.orderId)).size !== allocations.length) fail('Заказы не должны повторяться', 400)
  const sum = allocations.reduce((total, part) => total + BigInt(part.amountCents), 0n)
  if (sum !== BigInt(amountCents)) fail('Сумма распределения должна совпадать с поступлением', 400)
  if (!['transfer', 'account', 'cash', 'barter'].includes(body.paymentMethod)) fail('Некорректный способ оплаты', 400)
  if (!['deposit', 'final_payment', 'client_payment'].includes(body.category)) fail('Некорректный вид поступления', 400)
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(body.date) || !Number.isFinite(Date.parse(body.date))) fail('Укажите дату платежа', 400)
  const day = body.date.slice(0, 10)
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) fail('Некорректная дата платежа', 400)
  if (body.comment !== undefined && (typeof body.comment !== 'string' || body.comment.trim().length > 1000)) fail('Комментарий: не более 1000 символов', 400)
  return { idempotencyKey: body.idempotencyKey.toLowerCase(), expectedRevision: body.expectedRevision, amountCents, allocations, date: new Date(body.date).toISOString(), paymentMethod: body.paymentMethod, category: body.category, comment: body.comment?.trim() || '' }
}
export const partyGroupPaymentReceipt = (row) => ({
  _id: String(row._id), groupId: String(row.groupId), amount: row.amount, date: row.date,
  paymentMethod: row.paymentMethod, category: row.category, comment: row.comment,
  allocations: row.allocations.map((part) => ({ orderId: String(part.orderId), orderTitle: part.orderTitle, amount: part.amount, transactionId: String(part.transactionId) })),
  revision: row.revision || 1,
  history: (row.history || []).map((entry) => ({
    revision: entry.revision, reason: entry.reason, createdAt: entry.createdAt,
    actorStaffId: entry.actorStaffId ? String(entry.actorStaffId) : null,
    actorUserId: entry.actorUserId ? String(entry.actorUserId) : null,
    actorName: entry.actorName || '',
    before: entry.before.map((part) => ({ orderId: String(part.orderId), orderTitle: part.orderTitle, amount: part.amount })),
    after: entry.after.map((part) => ({ orderId: String(part.orderId), orderTitle: part.orderTitle, amount: part.amount })),
  })),
  createdAt: row.createdAt,
})

export const listPartyGroupPayments = async ({ tenantId, orderId }) => {
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({ _id: orderId, tenantId }).lean()
  if (!order) fail('Заказ не найден', 404)
  const Payments = await getPartyGroupPaymentModel()
  const filter = order.partyEventGroupId
    ? { tenantId, $or: [{ groupId: order.partyEventGroupId }, { 'allocations.orderId': order._id }] }
    : { tenantId, 'allocations.orderId': order._id }
  const rows = await Payments.find(filter).sort({ createdAt: -1, _id: -1 }).limit(50).lean()
  return { payments: rows.map(partyGroupPaymentReceipt) }
}

export const createPartyGroupPayment = async ({ tenantId, orderId, body }) => {
  const payload = normalizePartyGroupPayment(body)
  const requestHash = createHash('sha256').update(JSON.stringify({ orderId, ...payload })).digest('hex')
  const [Orders, Groups, Transactions, Payments] = await Promise.all([getPartyOrderModel(), getPartyEventGroupModel(), getPartyTransactionModel(), getPartyGroupPaymentModel()])
  await Payments.init()
  return withPartyFinancialTransaction(tenantId, async (session) => {
    const prior = await Payments.findOne({ tenantId, idempotencyKey: payload.idempotencyKey }).session(session).lean()
    if (prior) {
      if (prior.requestHash !== requestHash) fail('Этот ключ уже использован для другого платежа')
      return { payment: partyGroupPaymentReceipt(prior), replayed: true }
    }
    const current = await Orders.findOne({ _id: orderId, tenantId }).session(session).lean()
    if (!current) fail('Заказ не найден', 404)
    if (!current.partyEventGroupId) fail('Заказ не входит в группу')
    const group = await Groups.findOne({ _id: current.partyEventGroupId, tenantId, revision: payload.expectedRevision }).session(session).lean()
    if (!group) fail('Группа изменилась. Обновите страницу')
    const ids = payload.allocations.map((part) => part.orderId)
    const orders = await Orders.find({ _id: { $in: ids }, tenantId, partyEventGroupId: group._id }).session(session).lean()
    if (orders.length !== ids.length || orders.some((order) => !['draft', 'active'].includes(order.status))) fail('Все части платежа должны относиться к открытым заказам этой группы')
    const persisted = await Transactions.find({ tenantId, orderId: { $in: ids } }).select('orderId').session(session).lean()
    for (const order of orders) {
      if (order.transactions?.length && !persisted.some((item) => String(item.orderId) === String(order._id))) fail(`В заказе «${order.title || order._id}» есть старые встроенные платежи. Откройте «Проверить старый журнал платежей» в карточке этой части и выполните перенос; новый платёж не сохранён`)
    }
    const paymentId = new Types.ObjectId()
    const allocations = payload.allocations.map((part) => ({ orderId: part.orderId, amount: part.amountCents / 100, orderTitle: orders.find((order) => String(order._id) === part.orderId).title || '', transactionId: new Types.ObjectId() }))
    const data = { tenantId, groupId: group._id, idempotencyKey: payload.idempotencyKey, requestHash, amount: payload.amountCents / 100, date: new Date(payload.date), paymentMethod: payload.paymentMethod, category: payload.category, comment: payload.comment }
    await Transactions.create(allocations.map((part) => ({ _id: part.transactionId, tenantId, orderId: part.orderId, groupPaymentId: paymentId, amount: part.amount, type: 'income', category: data.category, date: data.date, paymentMethod: data.paymentMethod, comment: data.comment, clientId: orders.find((order) => String(order._id) === part.orderId).contactRoles?.payerClientId || orders.find((order) => String(order._id) === part.orderId).clientId || null })), { session, ordered: true })
    for (const order of orders) {
      const result = await Orders.updateOne({ _id: order._id, tenantId, partyEventGroupId: group._id, status: order.status }, { $inc: { sharedLocationRevision: 1 }, $set: { updatedAt: new Date() } }, { session })
      if (result.matchedCount !== 1) fail('Заказ изменился. Обновите страницу')
    }
    const [saved] = await Payments.create([{ _id: paymentId, ...data, allocations }], { session })
    return { payment: partyGroupPaymentReceipt(saved), replayed: false }
  })
}
