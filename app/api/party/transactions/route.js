import { NextResponse } from 'next/server'
import {
  getPartyOrderModel,
  getPartyTransactionModel,
} from '@server/partyModels'
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
import { assertPartyReportGate } from '@server/partyReportGates'
import { canAccessPartyTransaction } from '@server/partyTransactionAccess'
import { buildPartyTransactionRequestIdentity } from '@server/partyTransactionIdempotency'
import {
  buildPartyOrderAccessFilter,
  canPartyAccess,
} from '@helpers/partyRolePermissions'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
    allowLocationOwner: true,
  })
  if (error) return error

  const { searchParams } = new URL(req.url)
  const orderId = searchParams.get('orderId') || ''
  if (
    !['finance.payments', 'finance.payouts', 'finance.expenses'].some(
      (resource) => canPartyAccess(context, { resource })
    )
  )
    return partyError(
      403,
      'partycrm_finance_forbidden',
      'Нет доступа к финансовым операциям',
      'permission'
    )
  let selectedOrder
  if (orderId) {
    const { order, error: orderError } = await validatePartyTransactionOrder({
      tenantId: context.tenantId,
      orderId,
    })
    if (orderError) return orderError
    if (!canPartyAccess(context, { resource: 'orders', order }))
      return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
    selectedOrder = order
  }

  const transactions = await listPartyTransactions({
    tenantId: context.tenantId,
    orderId,
  })

  const Orders = await getPartyOrderModel()
  const orders = selectedOrder
    ? [selectedOrder]
    : await Orders.find({
        $and: [
          buildPartyOrderAccessFilter(context),
          {
            _id: {
              $in: [...new Set(transactions.map((item) => item.orderId))],
            },
          },
        ],
      }).lean()
  const byOrder = new Map(orders.map((order) => [String(order._id), order]))
  return NextResponse.json({
    success: true,
    data: transactions.filter((transaction) => {
      const order = byOrder.get(String(transaction.orderId))
      return order && canAccessPartyTransaction(context, transaction, order)
    }),
  })
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
    allowLocationOwner: true,
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
    return partyError(
      400,
      'partycrm_invalid_order_id',
      'Некорректный заказ',
      'validation'
    )
  }
  let result
  try {
    const key = req.headers?.get?.('Idempotency-Key')
    const identity = key
      ? buildPartyTransactionRequestIdentity({
          key,
          tenantId: context.tenantId,
          actorId: context.staff?._id,
          body,
          payload,
        })
      : null
    // Index creation cannot run inside a MongoDB transaction. Calls without a
    // key retain their existing behavior and require no idempotency index init.
    if (identity) await (await getPartyTransactionModel()).init()
    result = await withPartyFinancialTransaction(
      context.tenantId,
      async (session) => {
        const PartyOrders = await getPartyOrderModel()
        const PartyTransactions = await getPartyTransactionModel()
        const filter = { _id: payload.orderId, tenantId: context.tenantId }
        const order = await PartyOrders.findOne(filter).session(session).lean()
        if (!order)
          return {
            error: partyError(
              404,
              'partycrm_order_not_found',
              'Заказ не найден',
              'validation'
            ),
          }
        if (!canAccessPartyTransaction(context, payload, order, 'edit'))
          return {
            error: partyError(
              403,
              'partycrm_finance_forbidden',
              'Нет права изменять эти финансовые операции',
              'permission'
            ),
          }
        if (identity) {
          const repeated = await PartyTransactions.findOne({
            tenantId: context.tenantId,
            idempotencyActorId: identity.idempotencyActorId,
            idempotencyKey: identity.idempotencyKey,
          })
            .session(session)
            .lean()
          if (repeated) {
            if (
              String(repeated.orderId) !== String(order._id) ||
              !canAccessPartyTransaction(context, repeated, order, 'edit')
            )
              return {
                error: partyError(
                  403,
                  'partycrm_finance_forbidden',
                  'Нет доступа к ранее сохранённой денежной операции',
                  'permission'
                ),
              }
            if (repeated.requestFingerprint !== identity.requestFingerprint)
              return {
                error: partyError(
                  409,
                  'partycrm_transaction_idempotency_conflict',
                  'Этот ключ уже использован для другой денежной операции',
                  'conflict'
                ),
              }
            return { order, transaction: repeated, replayed: true }
          }
        }
        if (order.status === 'closed') {
          return {
            error: partyError(
              409,
              'partycrm_closed_order_transaction_readonly',
              'Для закрытого заказа нельзя добавлять транзакции',
              'validation'
            ),
          }
        }
        const { error: staffError } = validatePartyPayoutTransactionStaff({
          order,
          payload,
        })
        if (staffError) return { error: staffError }
        if (payload.type === 'expense' && payload.category === 'payout')
          await assertPartyReportGate({
            tenantId: context.tenantId,
            order,
            action: 'payout',
            staffId: payload.staffId,
            session,
          })
        const persisted = await PartyTransactions.findOne({
          tenantId: context.tenantId,
          orderId: payload.orderId,
        })
          .session(session)
          .lean()
        if (order.transactions?.length && !persisted) {
          return {
            error: partyError(
              409,
              'partycrm_legacy_ledger_migration_required',
              'Сначала перенесите старый журнал платежей этого заказа',
              'conflict'
            ),
          }
        }
        // Conflict with a concurrent close, delete or legacy migration of this order.
        await PartyOrders.updateOne(
          filter,
          { $inc: { sharedLocationRevision: 1 } },
          { session }
        )
        const [transaction] = await PartyTransactions.create(
          [
            {
              ...payload,
              ...(identity || {}),
              tenantId: context.tenantId,
              clientId: payload.clientId || order.clientId || null,
            },
          ],
          { session }
        )
        return { order, transaction }
      }
    )
  } catch (error) {
    if (error.status)
      return partyError(
        error.status,
        error.code || 'partycrm_transaction_forbidden',
        error.message,
        'validation'
      )
    return partyError(
      500,
      'partycrm_transaction_create_failed',
      'Не удалось сохранить транзакцию',
      'server'
    )
  }
  if (result.error) return result.error
  const { order, transaction } = result

  if (result.replayed)
    return NextResponse.json(
      {
        success: true,
        data: serializePartyTransaction(transaction),
        replayed: true,
      },
      { status: 201 }
    )

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
