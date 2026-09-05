import { parseJsonBody } from '@server/partyApi'
import { financialResponse, financialRoute } from '@server/partyFinancialApi'
import { getPartyMoneyTaskModel } from '@server/partyFinancialModels'
import {
  assertMoneyTaskAccess,
  reviewPartyMoneyTask,
  submitPartyMoneyTask,
} from '@server/partyMoneyTasks'
import {
  financialError,
  isFinancialId,
} from '@helpers/partyFinancialSettlements'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

const getId = async (params) => {
  const { id } = await params
  if (!isFinancialId(id)) throw financialError('Некорректное поручение')
  return id
}
export const GET = financialRoute(async (req, context, { params }) => {
  const id = await getId(params)
  const Tasks = await getPartyMoneyTaskModel()
  const task = await Tasks.findOne({
    tenantId: context.tenantId,
    _id: id,
  })
    .select('-idempotencyKey -createPayloadHash')
    .lean()
  assertMoneyTaskAccess(task, context)
  return financialResponse(task)
})
export const PATCH = financialRoute(async (req, context, { params }) => {
  const id = await getId(params)
  const body = await parseJsonBody(req)
  const result =
    body.action === 'submit_completion'
      ? {
          task: await submitPartyMoneyTask({ context, id, body }),
          repeated: false,
        }
      : await reviewPartyMoneyTask({ context, id, body })
  if (!result.repeated)
    await recordPartyOrderAudit({
      context,
      orderId: result.task.orderId,
      action: `money_task_${body.action}`,
      summary:
        body.action === 'submit_completion'
          ? 'Передал денежное поручение на проверку'
          : body.action === 'approve_completion'
            ? 'Подтвердил выполнение денежного поручения'
            : body.action === 'request_revision'
              ? 'Вернул денежное поручение на доработку'
              : 'Отменил денежное поручение',
      changes: [],
      metadata: {
        moneyTaskId: id,
        operationId: result.operation?._id || null,
        revision: result.task.revision,
      },
    })
  if (result.operation)
    result.operation = {
      ...result.operation,
      idempotencyKey: undefined,
      payloadHash: undefined,
    }
  if (result.task) {
    result.task = result.task.toObject ? result.task.toObject() : result.task
    delete result.task.idempotencyKey
    delete result.task.createPayloadHash
  }
  return financialResponse(result)
})
