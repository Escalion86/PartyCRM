import { NextResponse } from 'next/server'
import { getPartyOrderModel, getPartyTransactionModel } from '@server/partyModels'
import { withPartyFinancialTransaction } from '@server/partyFinancialSettlements'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import {
  normalizePartyTransactionPayload,
  serializePartyTransaction,
  validatePartyPayoutTransactionStaff,
  validatePartyTransactionOrder,
} from '@server/partyTransactions'
import { syncPartyOrderCalendarAfterCrud } from '@server/partyOrderCalendarHooks'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

const getId = async (params) => {
  const resolved = await params
  return resolved?.id
}

export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(
      400,
      'partycrm_invalid_transaction_id',
      'Некорректная транзакция',
      'validation'
    )
  }

  const PartyTransactions = await getPartyTransactionModel()
  const existing = await PartyTransactions.findOne({
    _id: id,
    tenantId: context.tenantId,
  }).lean()
  if (!existing) {
    return partyError(
      404,
      'partycrm_transaction_not_found',
      'Транзакция не найдена'
    )
  }

  if (existing.groupPaymentId) {
    return partyError(
      409,
      'partycrm_group_payment_transaction_readonly',
      'Часть общего платежа нельзя изменить или удалить отдельно. Исправьте распределение в истории общего поступления.',
      'validation'
    )
  }

  const { order: existingOrder, error: existingOrderError } =
    await validatePartyTransactionOrder({
      tenantId: context.tenantId,
      orderId: existing.orderId,
    })
  if (existingOrderError) return existingOrderError
  if (existingOrder.status === 'closed') {
    return partyError(
      409,
      'partycrm_closed_order_transaction_readonly',
      'Транзакции закрытого заказа нельзя редактировать',
      'validation'
    )
  }

  const body = await parseJsonBody(req)
  const payload = normalizePartyTransactionPayload({
    ...existing,
    ...body,
    orderId: body.orderId || existing.orderId,
    clientId: body.clientId ?? existing.clientId,
  })
  if (payload.amount <= 0) {
    return partyError(
      400,
      'partycrm_transaction_amount_required',
      'Укажите сумму транзакции',
      'validation'
    )
  }

  const { order, error: orderError } = await validatePartyTransactionOrder({
    tenantId: context.tenantId,
    orderId: payload.orderId,
  })
  if (orderError) return orderError
  if (order.status === 'closed') {
    return partyError(
      409,
      'partycrm_closed_order_transaction_readonly',
      'Для закрытого заказа нельзя добавлять транзакции',
      'validation'
    )
  }
  const { error: staffError } = validatePartyPayoutTransactionStaff({
    order,
    payload,
  })
  if (staffError) return staffError

  const relocating = String(existing.orderId) !== String(payload.orderId)
  let transaction
  if (relocating) {
    let result
    try {
      result = await withPartyFinancialTransaction(context.tenantId, async (session) => {
        const current = await PartyTransactions.findOne({ _id: id, tenantId: context.tenantId }).session(session).lean()
        if (!current || current.groupPaymentId || String(current.orderId) !== String(existing.orderId) || Number(new Date(current.updatedAt || 0)) !== Number(new Date(existing.updatedAt || 0))) {
          return { error: partyError(409, 'partycrm_transaction_changed', 'Транзакция уже изменилась. Обновите журнал.', 'conflict') }
        }
        const PartyOrders = await getPartyOrderModel()
        const target = await PartyOrders.findOne({ _id: payload.orderId, tenantId: context.tenantId }).session(session).lean()
        const source = await PartyOrders.findOne({ _id: current.orderId, tenantId: context.tenantId }).session(session).lean()
        if (!target || !source) return { error: partyError(404, 'partycrm_order_not_found', 'Заказ не найден', 'validation') }
        if (target.status === 'closed' || source.status === 'closed') return { error: partyError(409, 'partycrm_closed_order_transaction_readonly', 'Нельзя переносить транзакции закрытого заказа', 'validation') }
        const { error: payoutError } = validatePartyPayoutTransactionStaff({ order: target, payload })
        if (payoutError) return { error: payoutError }
        const persisted = await PartyTransactions.findOne({ tenantId: context.tenantId, orderId: payload.orderId }).session(session).lean()
        if (target.transactions?.length && !persisted) return { error: partyError(409, 'partycrm_legacy_ledger_migration_required', 'Сначала перенесите старый журнал платежей целевого заказа', 'conflict') }
        await PartyOrders.updateMany({ _id: { $in: [current.orderId, payload.orderId] }, tenantId: context.tenantId }, { $inc: { sharedLocationRevision: 1 } }, { session })
        const saved = await PartyTransactions.findOneAndUpdate(
          { _id: id, tenantId: context.tenantId },
          { $set: { ...payload, clientId: payload.clientId || target.clientId || null } },
          { session, returnDocument: 'after' }
        )
        return { transaction: saved }
      })
    } catch {
      return partyError(500, 'partycrm_transaction_update_failed', 'Не удалось перенести транзакцию', 'server')
    }
    if (result.error) return result.error
    transaction = result.transaction
  } else {
    transaction = await PartyTransactions.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    {
      $set: {
        ...payload,
        clientId: payload.clientId || order.clientId || null,
      },
    },
    { returnDocument: 'after' }
  )
  }

  await recordPartyOrderAudit({
    context,
    order,
    orderId: transaction.orderId,
    action: 'transaction_updated',
    summary: `Изменил финансовую операцию на сумму ${Number(transaction.amount || 0).toLocaleString('ru-RU')} ₽`,
    changes: [],
    metadata: { transactionId: String(transaction._id) },
  })

  await syncPartyOrderCalendarAfterCrud({
    tenantId: context.tenantId,
    orderId: String(transaction.orderId),
  })
  if (relocating) {
    await syncPartyOrderCalendarAfterCrud({ tenantId: context.tenantId, orderId: String(existing.orderId) })
  }

  return NextResponse.json({
    success: true,
    data: serializePartyTransaction(transaction),
  })
}

export async function DELETE(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(
      400,
      'partycrm_invalid_transaction_id',
      'Некорректная транзакция',
      'validation'
    )
  }

  const PartyTransactions = await getPartyTransactionModel()
  const existing = await PartyTransactions.findOne({
    _id: id,
    tenantId: context.tenantId,
  }).lean()
  if (!existing) {
    return partyError(
      404,
      'partycrm_transaction_not_found',
      'Транзакция не найдена'
    )
  }

  if (existing.groupPaymentId) {
    return partyError(
      409,
      'partycrm_group_payment_transaction_readonly',
      'Часть общего платежа нельзя изменить или удалить отдельно. Исправьте распределение в истории общего поступления.',
      'validation'
    )
  }

  const { order, error: orderError } = await validatePartyTransactionOrder({
    tenantId: context.tenantId,
    orderId: existing.orderId,
  })
  if (orderError) return orderError
  if (order.status === 'closed') {
    return partyError(
      409,
      'partycrm_closed_order_transaction_readonly',
      'Транзакции закрытого заказа нельзя удалить',
      'validation'
    )
  }

  const transaction = await PartyTransactions.findOneAndDelete({
    _id: id,
    tenantId: context.tenantId,
  }).lean()

  await recordPartyOrderAudit({
    context,
    order,
    orderId: transaction.orderId,
    action: 'transaction_deleted',
    summary: `Удалил финансовую операцию на сумму ${Number(transaction.amount || 0).toLocaleString('ru-RU')} ₽`,
    changes: [],
    metadata: { transactionId: String(transaction._id) },
  })

  await syncPartyOrderCalendarAfterCrud({
    tenantId: context.tenantId,
    orderId: String(transaction.orderId),
  })

  return NextResponse.json({
    success: true,
    data: serializePartyTransaction(transaction),
  })
}
