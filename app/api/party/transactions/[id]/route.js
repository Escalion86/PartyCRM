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
  validatePartyTransactionOrder,
} from '@server/partyTransactions'

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
  const transaction = await PartyTransactions.findOneAndDelete({
    _id: id,
    tenantId: context.tenantId,
  }).lean()
  if (!transaction) {
    return partyError(
      404,
      'partycrm_transaction_not_found',
      'Транзакция не найдена'
    )
  }

  return NextResponse.json({
    success: true,
    data: serializePartyTransaction(transaction),
  })
}
