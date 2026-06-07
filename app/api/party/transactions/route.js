import { NextResponse } from 'next/server'
import { getPartyTransactionModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import {
  listPartyTransactions,
  normalizePartyTransactionPayload,
  serializePartyTransaction,
  validatePartyTransactionOrder,
} from '@server/partyTransactions'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const { searchParams } = new URL(req.url)
  const orderId = searchParams.get('orderId') || ''
  if (orderId) {
    const { error: orderError } = await validatePartyTransactionOrder({
      tenantId: context.tenantId,
      orderId,
    })
    if (orderError) return orderError
  }

  const transactions = await listPartyTransactions({
    tenantId: context.tenantId,
    orderId,
  })

  return NextResponse.json({ success: true, data: transactions })
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const payload = normalizePartyTransactionPayload(body)
  if (!payload.orderId) {
    return partyError(
      400,
      'partycrm_transaction_order_required',
      'Укажите заказ',
      'validation'
    )
  }
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

  const PartyTransactions = await getPartyTransactionModel()
  const transaction = await PartyTransactions.create({
    ...payload,
    tenantId: context.tenantId,
    clientId: payload.clientId || order.clientId || null,
  })

  return NextResponse.json(
    { success: true, data: serializePartyTransaction(transaction) },
    { status: 201 }
  )
}
