import { NextResponse } from 'next/server'
import { getPartyTransactionModel } from '@server/partyModels'
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

  const transaction = await PartyTransactions.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    {
      $set: {
        ...payload,
        clientId: payload.clientId || order.clientId || null,
      },
    },
    { returnDocument: 'after' }
  )

  await syncPartyOrderCalendarAfterCrud({
    tenantId: context.tenantId,
    orderId: String(transaction.orderId),
  })

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

  await syncPartyOrderCalendarAfterCrud({
    tenantId: context.tenantId,
    orderId: String(transaction.orderId),
  })

  return NextResponse.json({
    success: true,
    data: serializePartyTransaction(transaction),
  })
}
