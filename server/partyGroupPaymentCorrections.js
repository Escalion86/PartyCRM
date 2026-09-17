import { createHash } from 'node:crypto'
import { getPartyGroupPaymentModel, getPartyGroupPaymentCorrectionModel } from './partyGroupPaymentModels'
import { getPartyOrderModel, getPartyTransactionModel } from './partyModels'
import { withPartyFinancialTransaction } from './partyFinancialSettlements'
import { partyGroupPaymentCents, partyGroupPaymentReceipt } from './partyGroupPayments'

const fail = (message, status = 409) => {
  const error = new Error(message)
  error.status = status
  error.code = 'partycrm_group_payment_correction_error'
  throw error
}
export const normalizePartyGroupPaymentCorrection = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Некорректные данные', 400)
  if (typeof body.idempotencyKey !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.idempotencyKey)) fail('Некорректный ключ операции', 400)
  if (!Number.isSafeInteger(body.expectedPaymentRevision) || body.expectedPaymentRevision < 1) fail('Передайте версию платежа', 400)
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 1000) fail('Укажите причину: от 1 до 1000 символов', 400)
  if (!Array.isArray(body.allocations) || body.allocations.length < 2 || body.allocations.length > 20) fail('Распределите платеж между 2–20 заказами', 400)
  const allocations = body.allocations.map((part) => {
    if (typeof part?.orderId !== 'string' || !/^[a-f\d]{24}$/i.test(part.orderId)) fail('Некорректный заказ', 400)
    return { orderId: part.orderId.toLowerCase(), amountCents: partyGroupPaymentCents(part.amount) }
  }).sort((a, b) => a.orderId.localeCompare(b.orderId))
  if (new Set(allocations.map((part) => part.orderId)).size !== allocations.length) fail('Заказы не должны повторяться', 400)
  return { idempotencyKey: body.idempotencyKey.toLowerCase(), expectedPaymentRevision: body.expectedPaymentRevision, reason: body.reason.trim(), allocations }
}

export const correctPartyGroupPayment = async ({ tenantId, orderId, paymentId, body, actor = {} }) => {
  const payload = normalizePartyGroupPaymentCorrection(body)
  const requestHash = createHash('sha256').update(JSON.stringify({ orderId, paymentId, ...payload })).digest('hex')
  const [Orders, Transactions, Payments, Corrections] = await Promise.all([getPartyOrderModel(), getPartyTransactionModel(), getPartyGroupPaymentModel(), getPartyGroupPaymentCorrectionModel()])
  await Corrections.init()
  return withPartyFinancialTransaction(tenantId, async (session) => {
    const prior = await Corrections.findOne({ tenantId, idempotencyKey: payload.idempotencyKey }).session(session).lean()
    if (prior) {
      if (prior.requestHash !== requestHash) fail('Этот ключ уже использован для другой корректировки')
      return { payment: prior.receipt, replayed: true }
    }
    const current = await Orders.findOne({ _id: orderId, tenantId }).session(session).lean()
    if (!current) fail('Заказ не найден', 404)
    const payment = await Payments.findOne({ _id: paymentId, tenantId }).session(session).lean()
    if (!payment || (!payment.allocations.some((part) => String(part.orderId) === String(current._id)) && String(current.partyEventGroupId || '') !== String(payment.groupId))) fail('Платёж не найден', 404)
    if ((payment.revision || 1) !== payload.expectedPaymentRevision) fail('Платёж изменился. Обновите историю')
    const originalIds = payment.allocations.map((part) => String(part.orderId)).sort()
    if (JSON.stringify(originalIds) !== JSON.stringify(payload.allocations.map((part) => part.orderId))) fail('Можно менять суммы только между исходными частями платежа', 400)
    if (payload.allocations.reduce((sum, part) => sum + BigInt(part.amountCents), 0n) !== BigInt(partyGroupPaymentCents(payment.amount))) fail('Общая сумма платежа должна остаться прежней', 400)
    if (payload.allocations.every((part) => part.amountCents === partyGroupPaymentCents(payment.allocations.find((item) => String(item.orderId) === part.orderId).amount))) fail('Распределение не изменилось', 400)
    const orders = await Orders.find({ tenantId, _id: { $in: originalIds } }).session(session).lean()
    if (orders.length !== originalIds.length || orders.some((order) => !['draft', 'active'].includes(order.status))) fail('Все исходные заказы должны существовать и быть открытыми')
    const transactions = await Transactions.find({ tenantId, groupPaymentId: payment._id }).session(session).lean()
    if (transactions.length !== payment.allocations.length) fail('Журнал платежа изменился. Требуется сверка')
    for (const part of payment.allocations) {
      const transaction = transactions.find((row) => String(row._id) === String(part.transactionId))
      if (!transaction || String(transaction.orderId) !== String(part.orderId) || transaction.amount !== part.amount || transaction.type !== 'income' || transaction.category !== payment.category || transaction.paymentMethod !== payment.paymentMethod || new Date(transaction.date).getTime() !== new Date(payment.date).getTime() || (transaction.comment || '') !== (payment.comment || '')) fail('Журнал платежа изменился. Требуется сверка')
      const changed = await Transactions.updateOne({ _id: transaction._id, tenantId, groupPaymentId: payment._id, amount: part.amount }, { $set: { amount: payload.allocations.find((item) => item.orderId === String(part.orderId)).amountCents / 100 } }, { session })
      if (changed.matchedCount !== 1) fail('Журнал платежа изменился. Обновите историю')
    }
    for (const order of orders) {
      const changed = await Orders.updateOne({ _id: order._id, tenantId, status: order.status }, { $inc: { sharedLocationRevision: 1 }, $set: { updatedAt: new Date() } }, { session })
      if (changed.matchedCount !== 1) fail('Заказ изменился. Обновите страницу')
    }
    const allocations = payment.allocations.map((part) => ({ ...part, amount: payload.allocations.find((item) => item.orderId === String(part.orderId)).amountCents / 100 }))
    const revision = payload.expectedPaymentRevision + 1
    const history = [...(payment.history || []), { revision, reason: payload.reason, createdAt: new Date(), actorUserId: actor.actorUserId || null, actorStaffId: actor.actorStaffId || null, actorName: actor.actorName || '', before: payment.allocations.map(({ orderId, orderTitle, amount }) => ({ orderId, orderTitle, amount })), after: allocations.map(({ orderId, orderTitle, amount }) => ({ orderId, orderTitle, amount })) }]
    const versionFilter = payment.revision == null ? { $or: [{ revision: { $exists: false } }, { revision: null }] } : { revision: payment.revision }
    const changed = await Payments.updateOne({ _id: payment._id, tenantId, ...versionFilter }, { $set: { allocations, revision, history } }, { session })
    if (changed.matchedCount !== 1) fail('Платёж изменился. Обновите историю')
    const receipt = partyGroupPaymentReceipt({ ...payment, allocations, revision, history })
    await Corrections.create([{ tenantId, paymentId: payment._id, idempotencyKey: payload.idempotencyKey, requestHash, receipt }], { session })
    return { payment: receipt, replayed: false }
  })
}
