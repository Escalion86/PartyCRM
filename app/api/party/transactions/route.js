import { NextResponse } from 'next/server'
import { getPartyOrderModel, getPartyTransactionModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
  isValidObjectId,
} from '@server/partyApi'
import { withPartyFinancialTransaction } from '@server/partyFinancialSettlements'
import {
  listPartyTransactions,
  normalizePartyTransactionPayload,
  serializePartyTransaction,
  validatePartyPayoutTransactionStaff,
  validatePartyTransactionOrder,
} from '@server/partyTransactions'
import { syncPartyOrderCalendarAfterCrud } from '@server/partyOrderCalendarHooks'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

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

  if (!isValidObjectId(payload.orderId)) {
    return partyError(400, 'partycrm_invalid_order_id', 'Некорректный заказ', 'validation')
  }
  let result
  try {
    result = await withPartyFinancialTransaction(context.tenantId, async (session) => {
      const PartyOrders = await getPartyOrderModel()
      const PartyTransactions = await getPartyTransactionModel()
      const filter = { _id: payload.orderId, tenantId: context.tenantId }
      const order = await PartyOrders.findOne(filter).session(session).lean()
      if (!order) return { error: partyError(404, 'partycrm_order_not_found', 'Заказ не найден', 'validation') }
      if (order.status === 'closed') {
        return { error: partyError(409, 'partycrm_closed_order_transaction_readonly', 'Для закрытого заказа нельзя добавлять транзакции', 'validation') }
      }
      const { error: staffError } = validatePartyPayoutTransactionStaff({ order, payload })
      if (staffError) return { error: staffError }
      const persisted = await PartyTransactions.findOne({ tenantId: context.tenantId, orderId: payload.orderId }).session(session).lean()
      if (order.transactions?.length && !persisted) {
        return { error: partyError(409, 'partycrm_legacy_ledger_migration_required', 'Сначала перенесите старый журнал платежей этого заказа', 'conflict') }
      }
      // Conflict with a concurrent close, delete or legacy migration of this order.
      await PartyOrders.updateOne(filter, { $inc: { sharedLocationRevision: 1 } }, { session })
      const [transaction] = await PartyTransactions.create([{
        ...payload,
        tenantId: context.tenantId,
        clientId: payload.clientId || order.clientId || null,
      }], { session })
      return { order, transaction }
    })
  } catch {
    return partyError(500, 'partycrm_transaction_create_failed', 'Не удалось сохранить транзакцию', 'server')
  }
  if (result.error) return result.error
  const { order, transaction } = result

  await recordPartyOrderAudit({
    context,
    order,
    orderId: payload.orderId,
    action: 'transaction_created',
    summary: `${payload.type === 'income' ? 'Добавил оплату' : 'Добавил расход'} на сумму ${payload.amount.toLocaleString('ru-RU')} ₽`,
    changes: [],
    metadata: { transactionId: String(transaction._id) },
  })

  await syncPartyOrderCalendarAfterCrud({
    tenantId: context.tenantId,
    orderId: payload.orderId,
  })

  return NextResponse.json(
    { success: true, data: serializePartyTransaction(transaction) },
    { status: 201 }
  )
}
