import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError, isValidObjectId } from '@server/partyApi'
import { getPartyOrderModel } from '@server/partyModels'
import { canPartyAccess, filterPartyOrderForAccess } from '@helpers/partyRolePermissions'
import { getPartyWorkflow, findPartyWorkflowTransition } from '@helpers/partyWorkflow'
import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { validatePartyBriefForTransition } from '@server/partyBriefTemplates'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

export const dynamic = 'force-dynamic'
export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({ req, allowLocationOwner: true })
  if (error) return error
  try {
    const { id } = await params
    if (!isValidObjectId(id)) return partyError(400, 'partycrm_invalid_order_id', 'Некорректный заказ')
    const Orders = await getPartyOrderModel()
    const order = await Orders.findOne({ _id: id, tenantId: context.tenantId }).lean()
    if (!order || !canPartyAccess(context, { resource: 'orders', order })) return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
    if (!canPartyAccess(context, { resource: 'orders', action: 'transition', order })) return partyError(403, 'partycrm_transition_forbidden', 'Нет права передавать заказ между этапами')
    if (['closed', 'canceled'].includes(order.status)) return partyError(409, 'partycrm_order_readonly', 'Заказ закрыт или отменён')
    const body = await req.json()
    const workflow = getPartyWorkflow(context.company)
    const transition = findPartyWorkflowTransition({ workflow, order, toStageId: body.toStageId, context })
    if (!transition) return partyError(403, 'partycrm_transition_forbidden', 'Переход не предусмотрен или недоступен должности')
    if (body.expectedUpdatedAt !== new Date(order.updatedAt).toISOString()) return partyError(409, 'partycrm_order_changed', 'Заказ изменился. Обновите его перед передачей.')
    if (transition.requireBrief) {
      const validation = await validatePartyBriefForTransition({ tenantId: context.tenantId, order })
      if (!validation.ok) return partyError(409, 'partycrm_brief_required', 'Заполните обязательные вопросы брифа перед передачей заказа.', 'validation', { missingFields: validation.missingFields })
    }
    const updated = await Orders.findOneAndUpdate({ _id: id, tenantId: context.tenantId, ...getPartyOrderWriteGuard(order) }, { $set: { workflowStageId: body.toStageId } }, { new: true }).lean()
    if (!updated) return partyError(409, 'partycrm_order_changed', 'Заказ изменился во время передачи. Обновите его.')
    await recordPartyOrderAudit({ context, order: updated, previousOrder: order, action: 'order_stage_changed', summary: 'Передал заказ на другой рабочий этап' })
    const safe = filterPartyOrderForAccess(context, updated)
    return NextResponse.json({ success: true, data: safe, accessChanged: !safe })
  } catch (error) { return partyError(error.status || 500, error.code || 'partycrm_transition_failed', error.status ? error.message : 'Не удалось передать заказ') }
}
