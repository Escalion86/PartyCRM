import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getPartyRequestContext, parseJsonBody, partyError } from './partyApi'
import {
  getPartyOrderModel,
  getPartyPaymentExpectationModel,
  getPartyTransactionModel,
} from './partyModels'
import { withPartyFinancialTransaction } from './partyFinancialSettlements'
import { canAccessPartyTransaction } from './partyTransactionAccess'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import {
  normalizePartyPaymentExpectation,
  serializePartyPaymentExpectation,
} from '../helpers/partyPaymentExpectations.js'
import {
  partyBookingFailure,
  partyMoneyKopecks,
} from '../helpers/partyOrderBooking.js'
import { syncPartyOrderCalendarAfterCrud } from './partyOrderCalendarHooks'
import { assertPartyReportGate } from './partyReportGates'
import { recordPartyOrderAudit } from './partyAuditLog'
import { parsePartyIsoDate } from '../helpers/partyIsoDate.js'

const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
const keyOf = (req) => {
  const key = req.headers.get('Idempotency-Key')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(String(key || '')))
    partyBookingFailure('Обновите форму платежа и повторите действие')
  return key
}
const orderOf = async (context, orderId, session = null) => {
  if (!/^[a-f\d]{24}$/i.test(String(orderId || '')))
    partyBookingFailure('Укажите заказ')
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({
    _id: orderId,
    tenantId: context.tenantId,
  })
    .session(session)
    .lean()
  if (!order || !canPartyAccess(context, { resource: 'orders', order }))
    partyBookingFailure('Заказ не найден', 404)
  return order
}
const assertWrite = (context, payment, order) => {
  if (!canAccessPartyTransaction(context, payment, order, 'edit'))
    partyBookingFailure('Нет права изменять эти платежи', 403)
  if (['closed', 'canceled'].includes(order.status))
    partyBookingFailure(
      'В закрытом или отменённом заказе платежи недоступны для изменения',
      409
    )
  if (
    payment.category === 'payout' &&
    !(order.assignedStaff || []).some(
      (item) => String(item.staffId) === String(payment.staffId)
    )
  )
    partyBookingFailure('Исполнитель не назначен на заказ')
}
export const parsePartyInitialExpectations = ({ context, payload, values }) => {
  if (!Array.isArray(values) || values.length > 50)
    partyBookingFailure('Допускается до 50 ожидаемых платежей при создании')
  return values.map((value) => {
    const payment = normalizePartyPaymentExpectation(value)
    assertWrite(context, payment, payload)
    return payment
  })
}
export const insertPartyInitialExpectations = async ({
  context,
  order,
  values,
  session,
}) => {
  if (!values.length) return
  const Expectations = await getPartyPaymentExpectationModel()
  await Expectations.create(
    values.map((value) => ({
      ...value,
      tenantId: context.tenantId,
      orderId: order._id,
      createdByStaffId: context.staff._id,
    })),
    { session, ordered: true }
  )
}

export const listPartyOrderExpectations = async ({ context, orderId }) => {
  const order = await orderOf(context, orderId)
  const Expectations = await getPartyPaymentExpectationModel()
  const records = await Expectations.find({
    tenantId: context.tenantId,
    orderId,
  })
    .sort({ dueAt: 1, _id: 1 })
    .lean()
  return records
    .filter((record) => canAccessPartyTransaction(context, record, order))
    .map((record) => serializePartyPaymentExpectation(record))
}

export const createPartyPaymentExpectation = async ({ context, req, body }) => {
  const value = normalizePartyPaymentExpectation(body)
  const key = keyOf(req)
  const createActorId = String(context.staff._id)
  const fingerprint = hash({ orderId: body.orderId, value })
  const Expectations = await getPartyPaymentExpectationModel()
  await Expectations.init()
  return withPartyFinancialTransaction(context.tenantId, async (session) => {
    const order = await orderOf(context, body.orderId, session)
    if (!canAccessPartyTransaction(context, value, order, 'edit'))
      partyBookingFailure('Нет права изменять эти платежи', 403)
    const previous = await Expectations.findOne({
      tenantId: context.tenantId,
      createActorId,
      createKey: key,
    })
      .session(session)
      .lean()
    if (previous) {
      if (
        previous.createFingerprint !== fingerprint ||
        String(previous.orderId) !== String(order._id)
      )
        partyBookingFailure('Ключ уже использован для другого ожидания', 409)
      return serializePartyPaymentExpectation(previous)
    }
    assertWrite(context, value, order)
    const Orders = await getPartyOrderModel()
    await Orders.updateOne(
      { _id: order._id, tenantId: context.tenantId },
      {
        $set: { hasPaymentExpectations: true },
        $inc: { sharedLocationRevision: 1 },
      },
      { session }
    )
    const [record] = await Expectations.create(
      [
        {
          ...value,
          tenantId: context.tenantId,
          orderId: order._id,
          createdByStaffId: context.staff._id,
          createKey: key,
          createActorId,
          createFingerprint: fingerprint,
        },
      ],
      { session, ordered: true }
    )
    return serializePartyPaymentExpectation(record.toObject())
  })
}

export const mutatePartyPaymentExpectation = async ({
  context,
  req,
  body,
  expectationId,
}) => {
  if (
    !/^[a-f\d]{24}$/i.test(String(expectationId || '')) ||
    !Number.isSafeInteger(body.expectedRevision)
  )
    partyBookingFailure('Обновите ожидаемый платёж перед изменением')
  const Expectations = await getPartyPaymentExpectationModel()
  const Orders = await getPartyOrderModel()
  const Transactions = await getPartyTransactionModel()
  const key =
    body.action === 'fulfill' ? `${context.staff._id}:${keyOf(req)}` : null
  const fingerprint = hash({
    action: body.action,
    amount: body.amount,
    date: body.date,
    paymentMethod: body.paymentMethod,
    comment: body.comment,
  })
  const outcome = await withPartyFinancialTransaction(
    context.tenantId,
    async (session) => {
      const record = await Expectations.findOne({
        _id: expectationId,
        tenantId: context.tenantId,
      })
        .session(session)
        .lean()
      if (!record) partyBookingFailure('Ожидаемый платёж не найден', 404)
      const order = await orderOf(context, record.orderId, session)
      if (!canAccessPartyTransaction(context, record, order, 'edit'))
        partyBookingFailure('Нет права изменять этот платёж', 403)
      const replay = key && record.fulfillments.find((item) => item.key === key)
      if (replay) {
        if (replay.fingerprint !== fingerprint)
          partyBookingFailure('Ключ уже использован для другой оплаты', 409)
        return { order, record, replayed: true }
      }
      assertWrite(context, record, order)
      if (
        record.revision !== body.expectedRevision ||
        record.status !== 'pending'
      )
        partyBookingFailure('Ожидание уже изменилось. Обновите список.', 409)
      let patch
      if (body.action === 'cancel') patch = { status: 'canceled' }
      else if (body.action === 'edit') {
        const value = normalizePartyPaymentExpectation({
          ...record,
          amount: record.amountKopecks / 100,
          dueAt: new Date(record.dueAt).toISOString(),
          ...body,
        })
        if (
          value.type !== record.type ||
          value.category !== record.category ||
          String(value.staffId || '') !== String(record.staffId || '')
        )
          partyBookingFailure(
            'Для изменения направления или категории создайте новое ожидание'
          )
        if (value.amountKopecks <= record.paidKopecks)
          partyBookingFailure(
            'Сумма ожидания должна быть больше уже исполненной части'
          )
        patch = value
      } else if (body.action === 'fulfill') {
        const amountKopecks = partyMoneyKopecks(body.amount)
        if (
          amountKopecks <= 0 ||
          amountKopecks > record.amountKopecks - record.paidKopecks
        )
          partyBookingFailure(
            'Сумма исполнения должна быть положительной и не превышать остаток'
          )
        const date = body.date ? parsePartyIsoDate(body.date) : new Date()
        if (!date || !Number.isFinite(+date))
          partyBookingFailure('Укажите существующую дату оплаты')
        const paymentMethod = body.paymentMethod || record.paymentMethod
        const value = normalizePartyPaymentExpectation({
          ...record,
          amount: record.amountKopecks / 100,
          dueAt: new Date(record.dueAt).toISOString(),
          paymentMethod,
        })
        const persisted = await Transactions.findOne({
          tenantId: context.tenantId,
          orderId: order._id,
        })
          .session(session)
          .lean()
        if (order.transactions?.length && !persisted)
          partyBookingFailure(
            'Сначала перенесите старый журнал платежей этого заказа',
            409,
            'partycrm_legacy_ledger_migration_required'
          )
        if (record.category === 'payout')
          await assertPartyReportGate({
            tenantId: context.tenantId,
            order,
            action: 'payout',
            staffId: record.staffId,
            session,
          })
        const [transaction] = await Transactions.create(
          [
            {
              tenantId: context.tenantId,
              expectationId: record._id,
              orderId: order._id,
              clientId: order.clientId || null,
              staffId: record.staffId,
              type: record.type,
              category: record.category,
              amount: amountKopecks / 100,
              date,
              paymentMethod: value.paymentMethod,
              comment:
                typeof body.comment === 'string'
                  ? body.comment.slice(0, 1000)
                  : record.comment,
            },
          ],
          { session, ordered: true }
        )
        const paidKopecks = record.paidKopecks + amountKopecks
        patch = {
          paidKopecks,
          status:
            paidKopecks === record.amountKopecks ? 'completed' : 'pending',
          fulfillments: [
            ...record.fulfillments,
            {
              transactionId: transaction._id,
              amountKopecks,
              date,
              key,
              fingerprint,
            },
          ],
        }
      } else partyBookingFailure('Неизвестное действие с платежом')
      await Orders.updateOne(
        { _id: order._id, tenantId: context.tenantId },
        { $inc: { sharedLocationRevision: 1 } },
        { session }
      )
      const updated = await Expectations.findOneAndUpdate(
        {
          _id: record._id,
          tenantId: context.tenantId,
          revision: record.revision,
          status: 'pending',
        },
        { $set: patch, $inc: { revision: 1 } },
        { returnDocument: 'after', session, runValidators: true }
      ).lean()
      if (!updated)
        partyBookingFailure('Ожидание уже изменилось. Обновите список.', 409)
      return { order, record: updated }
    }
  )
  if (!outcome.replayed) {
    await recordPartyOrderAudit({
      context,
      order: outcome.order,
      action: 'payment_expectation_updated',
      summary:
        body.action === 'fulfill'
          ? 'Записал фактическое исполнение ожидаемого платежа'
          : body.action === 'cancel'
            ? 'Отменил ожидание остатка платежа'
            : 'Изменил ожидаемый платёж',
      changes: [],
    })
    if (body.action === 'fulfill')
      await syncPartyOrderCalendarAfterCrud({
        tenantId: context.tenantId,
        orderId: outcome.order._id,
      })
  }
  return serializePartyPaymentExpectation(outcome.record)
}

export const partyExpectationRoute = (handler) => async (req, route) => {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
  })
  if (error) return error
  try {
    return NextResponse.json(
      {
        success: true,
        data: await handler({
          context,
          req,
          body: req.method === 'GET' ? {} : await parseJsonBody(req),
          params: await route?.params,
        }),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (cause) {
    return partyError(
      cause.status || 500,
      cause.code || 'partycrm_payment_expectation_failed',
      cause.status ? cause.message : 'Не удалось сохранить ожидаемый платёж'
    )
  }
}
