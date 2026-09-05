import { parseJsonBody } from '@server/partyApi'
import { financialResponse, financialRoute } from '@server/partyFinancialApi'
import {
  getPartyFinancialOperationModel,
  getPartyFinancialSettlementModel,
  getPartyMoneyTaskModel,
} from '@server/partyFinancialModels'
import { createPartyMoneyTask } from '@server/partyMoneyTasks'
import { isFinancialManager } from '@server/partyFinancialSettlements'
import { calculateCustodyBalance } from '@helpers/partyMoneyTasks'
import {
  financialError,
  isFinancialId,
} from '@helpers/partyFinancialSettlements'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

export const dynamic = 'force-dynamic'
export const GET = financialRoute(async (req, context) => {
  const Tasks = await getPartyMoneyTaskModel()
  const filter = { tenantId: context.tenantId }
  for (const name of ['orderId', 'staffId']) {
    const value = req.nextUrl.searchParams.get(name)
    if (value && !isFinancialId(value))
      throw financialError(`Некорректный фильтр ${name}`)
    if (value) filter[name] = value
  }
  if (!isFinancialManager(context))
    filter.responsibleStaffId = context.staff._id
  const status = req.nextUrl.searchParams.get('status')
  if (['pending', 'submitted', 'completed', 'canceled'].includes(status))
    filter.status = status
  const tasks = await Tasks.find(filter)
    .sort({ dueAt: 1, createdAt: -1 })
    .limit(1000)
    .select('-idempotencyKey -createPayloadHash')
    .lean()
  const Operations = await getPartyFinancialOperationModel()
  const custody = tasks.length
    ? await Operations.find({
        tenantId: context.tenantId,
        orderId: { $in: tasks.map((task) => task.orderId) },
        staffId: { $in: tasks.map((task) => task.staffId) },
        type: {
          $in: [
            'custody_received_from_client',
            'custody_transferred_to_company',
            'received_on_site',
          ],
        },
      })
        .select('-payloadHash -idempotencyKey')
        .lean()
    : []
  const Settlements = await getPartyFinancialSettlementModel()
  const settlements =
    tasks.length && isFinancialManager(context)
      ? await Settlements.find({
          tenantId: context.tenantId,
          orderId: { $in: tasks.map((task) => task.orderId) },
          staffId: { $in: tasks.map((task) => task.staffId) },
        })
          .select('orderId staffId importedReceivedOnSiteKopecks')
          .lean()
      : []
  return financialResponse(
    tasks.map((task) =>
      isFinancialManager(context)
        ? {
            ...task,
            custodyBalanceKopecks: calculateCustodyBalance(custody, {
              ...task,
              retainedKopecks:
                settlements.find(
                  (settlement) =>
                    String(settlement.orderId) === String(task.orderId) &&
                    String(settlement.staffId) === String(task.staffId)
                )?.importedReceivedOnSiteKopecks || 0,
            }),
          }
        : task
    )
  )
})
export const POST = financialRoute(async (req, context) => {
  const result = await createPartyMoneyTask({
    context,
    body: await parseJsonBody(req),
  })
  const task = result.task
  if (!result.repeated)
    await recordPartyOrderAudit({
      context,
      orderId: task.orderId,
      action: 'money_task_created',
      summary:
        task.type === 'receive_from_client'
          ? 'Поручил получить деньги у клиента'
          : 'Поручил передать деньги компании',
      changes: [],
      metadata: {
        moneyTaskId: task._id,
        responsibleStaffId: task.responsibleStaffId,
        amountKopecks: task.amountKopecks,
        dueAt: task.dueAt,
      },
    })
  const safeTask = task.toObject ? task.toObject() : task
  delete safeTask.idempotencyKey
  delete safeTask.createPayloadHash
  return financialResponse(
    { task: safeTask, repeated: result.repeated },
    result.repeated ? 200 : 201
  )
})
