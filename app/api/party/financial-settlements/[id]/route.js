import { parseJsonBody } from '@server/partyApi'
import { financialResponse, financialRoute } from '@server/partyFinancialApi'
import {
  getPartyFinancialSettlementModel,
  getPartyPayrollStatementModel,
} from '@server/partyFinancialModels'
import {
  assertSettlementAccess,
  enrichSettlements,
  isFinancialManager,
} from '@server/partyFinancialSettlements'
import {
  financialError,
  isFinancialId,
  normalizeSettlementAmounts,
} from '@helpers/partyFinancialSettlements'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

const idFrom = async (params) => {
  const { id } = await params
  if (!isFinancialId(id)) throw financialError('Некорректная сверка')
  return id
}
export const GET = financialRoute(async (req, context, { params }) => {
  const id = await idFrom(params)
  const Settlements = await getPartyFinancialSettlementModel()
  const settlement = await Settlements.findOne({
    tenantId: context.tenantId,
    _id: id,
  }).lean()
  assertSettlementAccess(settlement, context)
  return financialResponse((await enrichSettlements([settlement]))[0])
})
export const PUT = financialRoute(async (req, context, { params }) => {
  const id = await idFrom(params)
  const Settlements = await getPartyFinancialSettlementModel()
  const current = await Settlements.findOne({
    tenantId: context.tenantId,
    _id: id,
  }).lean()
  assertSettlementAccess(current, context)
  if (!['draft', 'revision'].includes(current.status))
    throw financialError(
      'Отправленную или утверждённую сверку нельзя менять; используйте корректировку',
      409
    )
  const settlement = await Settlements.findOneAndUpdate(
    { tenantId: context.tenantId, _id: id },
    { $set: normalizeSettlementAmounts(await parseJsonBody(req)) },
    { new: true, runValidators: true }
  ).lean()
  await recordPartyOrderAudit({
    context,
    orderId: current.orderId,
    action: 'financial_settlement_updated',
    summary: 'Изменил финансовую сверку сотрудника',
    changes: [],
    metadata: { settlementId: id },
  })
  return financialResponse((await enrichSettlements([settlement]))[0])
})
export const PATCH = financialRoute(async (req, context, { params }) => {
  const id = await idFrom(params)
  const body = await parseJsonBody(req)
  const action = String(body.action || '')
  const Settlements = await getPartyFinancialSettlementModel()
  const current = await Settlements.findOne({
    tenantId: context.tenantId,
    _id: id,
  }).lean()
  assertSettlementAccess(current, context, {
    managementOnly: ['approve', 'request_revision'].includes(action),
  })
  const now = new Date()
  let patch
  if (action === 'submit' && ['draft', 'revision'].includes(current.status))
    patch = {
      status: 'submitted',
      submittedAt: now,
      submittedByStaffId: context.staff._id,
      reviewComment: '',
    }
  else if (
    action === 'approve' &&
    current.status === 'submitted' &&
    isFinancialManager(context)
  ) {
    const Statements = await getPartyPayrollStatementModel()
    if (
      await Statements.exists({
        tenantId: context.tenantId,
        periodKey: current.periodKey,
        status: { $in: ['approved', 'paid'] },
      })
    )
      throw financialError(
        'Ведомость этого периода уже утверждена; расчёт принять нельзя',
        409
      )
    patch = {
      status: 'approved',
      reviewedAt: now,
      reviewedByStaffId: context.staff._id,
      reviewComment: '',
    }
  } else if (
    action === 'request_revision' &&
    current.status === 'submitted' &&
    isFinancialManager(context) &&
    String(body.comment || '').trim()
  )
    patch = {
      status: 'revision',
      reviewedAt: now,
      reviewedByStaffId: context.staff._id,
      reviewComment: String(body.comment).trim().slice(0, 1000),
    }
  else
    throw financialError(
      'Недопустимый переход статуса или отсутствует комментарий',
      409
    )
  const settlement = await Settlements.findOneAndUpdate(
    { tenantId: context.tenantId, _id: id, status: current.status },
    { $set: patch },
    { new: true, runValidators: true }
  ).lean()
  if (!settlement)
    throw financialError('Статус уже изменён другим пользователем', 409)
  await recordPartyOrderAudit({
    context,
    orderId: current.orderId,
    action: `financial_settlement_${action}`,
    summary:
      action === 'approve'
        ? 'Утвердил финансовую сверку'
        : action === 'submit'
          ? 'Отправил финансовую сверку'
          : 'Вернул финансовую сверку на доработку',
    changes: [],
    metadata: { settlementId: id },
  })
  return financialResponse((await enrichSettlements([settlement]))[0])
})
