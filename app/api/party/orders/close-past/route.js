import { assertPartyReportGate } from '@server/partyReportGates'
import { withPartyFinancialTransaction } from '@server/partyFinancialSettlements'
import { getPartyTaskOrderReadiness } from '@server/partyTaskReadiness'
import { snapshotPartyBriefForClose } from '@server/partyBriefTemplates'
import { maskPartyOrderBlockers, maskPartyOrderFinancialSummary } from '@helpers/partyOrderAccess'
import {
  canPartyAccess,
  buildPartyOrderAccessFilter,
} from '@helpers/partyRolePermissions'
import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { NextResponse } from 'next/server'
import {
  getPartyOrderModel,
  getPartyTransactionModel,
} from '@server/partyModels'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import { getPartyOrderCloseReadiness } from '@helpers/partyOrderCloseReadiness'
import { syncPartyOrderCalendarAfterCrud } from '@server/partyOrderCalendarHooks'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
  })
  if (error) return error
  if (
    !canPartyAccess(context, { resource: 'orders', action: 'transition' }) ||
    !canPartyAccess(context, { resource: 'orders.status', action: 'edit' })
  )
    return partyError(
      403,
      'partycrm_order_close_forbidden',
      'Нет права закрывать заказы',
      'permission'
    )

  const PartyOrders = await getPartyOrderModel()
  const today = startOfToday()
  const match = {
    tenantId: context.tenantId,
    status: { $in: ['draft', 'active'] },
    $or: [
      { dateEnd: { $lt: today } },
      {
        $and: [
          { $or: [{ dateEnd: null }, { dateEnd: { $exists: false } }] },
          { eventDate: { $lt: today } },
        ],
      },
    ],
  }

  const orders = await PartyOrders.find({
    ...match,
    $and: [buildPartyOrderAccessFilter(context)],
  }).lean()
  const PartyTransactions = await getPartyTransactionModel()
  const closed = []
  const skipped = []

  for (const original of orders) {
    const orderId = String(original._id)
    const outcome = await withPartyFinancialTransaction(
      context.tenantId,
      async (session) => {
        const order = await PartyOrders.findOne({
          _id: orderId,
          tenantId: context.tenantId,
          ...getPartyOrderWriteGuard(original),
        })
          .session(session)
          .lean()
        if (!order)
          return {
            orderId,
            blockers: [
              {
                code: 'order_changed',
                message:
                  'Заказ изменился во время проверки. Повторите закрытие.',
              },
            ],
          }
        if (
          !canPartyAccess(context, {
            resource: 'orders',
            action: 'transition',
            order,
          }) ||
          !canPartyAccess(context, {
            resource: 'orders.status',
            action: 'edit',
            order,
          })
        )
          return {
            orderId,
            blockers: [
              {
                code: 'forbidden',
                message: 'Недостаточно прав для закрытия заказа.',
              },
            ],
          }
        const currentTransactions = await PartyTransactions.find({
          tenantId: context.tenantId,
          orderId,
        })
          .session(session)
          .lean()
        const tasks = await getPartyTaskOrderReadiness({
          tenantId: context.tenantId,
          order,
          session,
        })
        const readiness = getPartyOrderCloseReadiness({
          order: tasks.order,
          transactions: currentTransactions.length
            ? currentTransactions
            : order.transactions,
        })
        readiness.blockers.push(...tasks.blockers)
        if (readiness.blockers.length)
          return {
            orderId,
            blockers: readiness.blockers,
            summary: readiness.summary,
          }
        try {
          await assertPartyReportGate({
            tenantId: context.tenantId,
            order,
            action: 'close',
            session,
          })
        } catch (error) {
          if (error.status === 409)
            return {
              orderId,
              blockers: [{ code: error.code, message: error.message }],
              summary: readiness.summary,
            }
          throw error
        }
        const eventBrief = await snapshotPartyBriefForClose({
          tenantId: context.tenantId,
          order,
        })
        const updated = await PartyOrders.findOneAndUpdate(
          {
            _id: orderId,
            tenantId: context.tenantId,
            ...getPartyOrderWriteGuard(order),
          },
          {
            $set: { status: 'closed', eventBrief },
            $inc: { commercialRevision: 1, sharedLocationRevision: 1 },
          },
          { returnDocument: 'after', session }
        ).lean()
        return updated
          ? { orderId, summary: readiness.summary }
          : {
              orderId,
              blockers: [
                {
                  code: 'order_changed',
                  message:
                    'Заказ изменился во время проверки. Повторите закрытие.',
                },
              ],
              summary: readiness.summary,
            }
      }
    )
    const safeOutcome = { ...outcome, ...(outcome.summary ? { summary: maskPartyOrderFinancialSummary(context, original, outcome.summary) } : {}), ...(outcome.blockers ? { blockers: maskPartyOrderBlockers(context, original, outcome.blockers) } : {}) }
    if (outcome.blockers) skipped.push(safeOutcome)
    else closed.push(safeOutcome)
  }
  const closedIds = closed.map((item) => item.orderId)
  if (closedIds.length > 0) {
    await Promise.all(
      closedIds.map((orderId) =>
        Promise.all([
          syncPartyOrderCalendarAfterCrud({
            tenantId: context.tenantId,
            orderId,
            previousOrder: orders.find(
              (order) => String(order._id) === orderId
            ),
          }),
          recordPartyOrderAudit({
            context,
            orderId,
            order: {
              ...orders.find((order) => String(order._id) === orderId),
              status: 'closed',
            },
            previousOrder: orders.find(
              (order) => String(order._id) === orderId
            ),
            action: 'order_status_changed',
            summary: 'Закрыл прошедший заказ',
          }),
        ])
      )
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      closedCount: closed.length,
      closedIds: closed.map((item) => item.orderId),
      closed: closed,
      skipped,
    },
  })
}
