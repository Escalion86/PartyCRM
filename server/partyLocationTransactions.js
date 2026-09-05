import { createHash } from 'node:crypto'
import { Schema } from 'mongoose'
import { getProductModel } from './productDbConnect'
import { PRODUCTS } from './productContext'
import {
  getPartyOrderModel,
  getPartyTransactionModel,
  getPartyStaffModel,
} from './partyModels'
import {
  normalizePartyTransactionPayload,
  serializePartyTransaction,
  validatePartyPayoutTransactionStaff,
} from './partyTransactions'
import {
  locationFailure,
  buildLocationOrderFilter,
  lockLocationMembership,
  requireLocationObjectId,
} from './partyLocationAccess'
import { getPartyOrderCloseReadiness } from '@helpers/partyOrderCloseReadiness'
import { recordPartyOrderAudit } from './partyAuditLog'
import { syncPartyOrderCalendarAfterCrud } from './partyOrderCalendarHooks'

const getLocationMoneyRequestModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'LocationMoneyRequest',
    collectionName: 'locationMoneyRequests',
    schemaDefinition: {
      tenantId: { type: Schema.Types.ObjectId, required: true },
      actorStaffId: { type: Schema.Types.ObjectId, required: true },
      key: { type: String, required: true },
      fingerprint: { type: String, required: true },
      orderId: { type: Schema.Types.ObjectId, required: true },
      transactionId: { type: Schema.Types.ObjectId, required: true },
    },
    schemaOptions: { timestamps: true },
    configureSchema: (schema) =>
      schema.index({ tenantId: 1, actorStaffId: 1, key: 1 }, { unique: true }),
  })

const lockedOrder = async (Orders, context, orderId, session) => {
  const order = await Orders.findOneAndUpdate(
    buildLocationOrderFilter(context, {
      _id: requireLocationObjectId(orderId),
    }),
    { $inc: { locationFinanceRevision: 1 } },
    { session, new: true }
  ).lean()
  if (!order) locationFailure('Заказ не найден', 404)
  return order
}

export const createLocationTransaction = async ({ context, body, key }) => {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key || ''))
    locationFailure('Требуется ключ безопасного повтора операции')
  if (!body || typeof body !== 'object' || Array.isArray(body))
    locationFailure('Некорректная финансовая операция')
  const allowed = new Set([
    'orderId',
    'type',
    'category',
    'amount',
    'date',
    'paymentMethod',
    'comment',
    'staffId',
  ])
  if (Object.keys(body).some((field) => !allowed.has(field)))
    locationFailure('Недопустимое поле финансовой операции')
  if (
    !['income', 'expense'].includes(body.type) ||
    !Number.isSafeInteger(Number(body.amount)) ||
    Number(body.amount) <= 0
  )
    locationFailure('Укажите тип и положительную сумму операции в целых рублях')
  if (body.date && !Number.isFinite(new Date(body.date).getTime()))
    locationFailure('Некорректная дата операции')
  const payload = normalizePartyTransactionPayload(body)
  if (payload.amount <= 0)
    locationFailure('Сумма должна быть не меньше одного рубля')
  requireLocationObjectId(payload.orderId)
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ ...payload, date: body.date || null }))
    .digest('hex')
  const [Orders, Transactions, Requests, Staff] = await Promise.all([
    getPartyOrderModel(),
    getPartyTransactionModel(),
    getLocationMoneyRequestModel(),
    getPartyStaffModel(),
  ])
  await Requests.init()
  const session = await Orders.db.startSession()
  let result
  try {
    await session.withTransaction(async () => {
      result = null
      await lockLocationMembership(context, session)
      const order = await lockedOrder(Orders, context, payload.orderId, session)
      const requestFilter = {
        tenantId: context.tenantId,
        actorStaffId: context.staff._id,
        key,
      }
      const previous = await Requests.findOne(requestFilter)
        .session(session)
        .lean()
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          locationFailure('Этот ключ уже использован для другой операции', 409)
        const transaction = await Transactions.findOne({
          _id: previous.transactionId,
          tenantId: context.tenantId,
          orderId: order._id,
        })
          .session(session)
          .lean()
        if (!transaction)
          locationFailure('Сохранённая операция недоступна', 409)
        result = { transaction, order, replayed: true }
        return
      }
      if (['closed', 'canceled'].includes(order.status))
        locationFailure(
          'Для закрытого или отменённого заказа нельзя добавлять операции',
          409
        )
      const { error } = validatePartyPayoutTransactionStaff({ order, payload })
      if (error)
        locationFailure('Получатель выплаты должен быть назначен на этот заказ')
      if (
        payload.staffId &&
        !(await Staff.exists({
          _id: payload.staffId,
          tenantId: context.tenantId,
        }).session(session))
      )
        locationFailure('Получатель выплаты не найден в компании')
      const [transaction] = await Transactions.create(
        [
          {
            ...payload,
            tenantId: context.tenantId,
            clientId: order.clientId || null,
          },
        ],
        { session }
      )
      await Requests.create(
        [
          {
            ...requestFilter,
            fingerprint,
            orderId: order._id,
            transactionId: transaction._id,
          },
        ],
        { session }
      )
      result = { transaction: transaction.toObject(), order, replayed: false }
    })
  } catch (error) {
    if (error?.code === 11000)
      locationFailure(
        'Операция с этим ключом уже обрабатывается. Повторите запрос с тем же ключом.',
        409
      )
    throw error
  } finally {
    await session.endSession()
  }
  if (!result.replayed) {
    await recordPartyOrderAudit({
      context,
      order: result.order,
      orderId: payload.orderId,
      action: 'transaction_created',
      summary: `${payload.type === 'income' ? 'Добавил оплату' : 'Добавил расход'} площадки: ${payload.amount} ₽`,
      changes: [],
      metadata: { transactionId: String(result.transaction._id) },
    })
    await syncPartyOrderCalendarAfterCrud({
      tenantId: context.tenantId,
      orderId: payload.orderId,
    })
  }
  return serializePartyTransaction(result.transaction)
}

export const closeLocationOrder = async ({ context, orderId }) => {
  const [Orders, Transactions] = await Promise.all([
    getPartyOrderModel(),
    getPartyTransactionModel(),
  ])
  const session = await Orders.db.startSession()
  let previousOrder
  let changed = false
  try {
    await session.withTransaction(async () => {
      changed = false
      await lockLocationMembership(context, session)
      previousOrder = await lockedOrder(Orders, context, orderId, session)
      if (previousOrder.status === 'closed') return
      if (previousOrder.status === 'canceled')
        locationFailure('Отменённый заказ нельзя закрыть', 409)
      const transactions = await Transactions.find({
        tenantId: context.tenantId,
        orderId,
      })
        .session(session)
        .lean()
      const readiness = getPartyOrderCloseReadiness({
        order: previousOrder,
        transactions: transactions.length
          ? transactions
          : previousOrder.transactions,
      })
      if (!readiness.ok)
        locationFailure(
          `Заказ не готов к закрытию: ${readiness.blockers.map((item) => item.message).join('; ')}`,
          409
        )
      const updated = await Orders.updateOne(
        buildLocationOrderFilter(context, {
          _id: orderId,
          status: previousOrder.status,
        }),
        { $set: { status: 'closed' } },
        { session }
      )
      if (!updated.matchedCount)
        locationFailure('Заказ изменился. Обновите страницу.', 409)
      changed = true
    })
  } finally {
    await session.endSession()
  }
  if (changed) {
    await recordPartyOrderAudit({
      context,
      order: { ...previousOrder, status: 'closed' },
      previousOrder,
      orderId,
      action: 'order_status_changed',
      summary: 'Владелец площадки закрыл заказ',
    })
    await syncPartyOrderCalendarAfterCrud({
      tenantId: context.tenantId,
      orderId,
      previousOrder,
    })
  }
}
