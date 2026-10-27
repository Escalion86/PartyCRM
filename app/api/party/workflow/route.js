import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import { getPartyCompanyModel, getPartyOrderModel, getPartyRoleModel } from '@server/partyModels'
import { getPartyWorkflow, normalizePartyWorkflow } from '@helpers/partyWorkflow'
import { canPartyAccess } from '@helpers/partyRolePermissions'

export const dynamic = 'force-dynamic'
export async function GET(req) {
  const { context, error } = await getPartyRequestContext({ req, allowLocationOwner: true })
  if (error) return error
  if (!canPartyAccess(context, { resource: 'orders' }) && !canPartyAccess(context, { resource: 'roles.manage' })) return partyError(403, 'partycrm_forbidden', 'Нет доступа к этапам заказов')
  return NextResponse.json({ success: true, data: getPartyWorkflow(context.company) })
}

export async function PATCH(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true, permissionAware: true })
  if (error) return error
  try {
    if (!canPartyAccess(context, { resource: 'roles.manage', action: 'edit' })) return partyError(403, 'partycrm_forbidden', 'Нет права изменять рабочие этапы')
    const body = await req.json()
    const workflow = normalizePartyWorkflow(body)
    const previous = getPartyWorkflow(context.company)
    if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== Number(previous.revision || 0)) return partyError(409, 'partycrm_workflow_changed', 'Этапы уже изменились. Обновите настройки.')
    const removed = previous.stages.map((stage) => stage.id).filter((id) => !workflow.stages.some((stage) => stage.id === id))
    const Orders = await getPartyOrderModel()
    if (removed.length && await Orders.exists({ tenantId: context.tenantId, workflowStageId: { $in: removed } })) return partyError(409, 'partycrm_workflow_stage_used', 'Удаляемый этап используется в заказах. Сначала переведите их на другой этап.')
    const Roles = await getPartyRoleModel()
    const roleIds = [...new Set(workflow.transitions.flatMap((transition) => transition.roleIds))]
    if (roleIds.length && await Roles.countDocuments({ tenantId: context.tenantId, _id: { $in: roleIds }, active: true }) !== roleIds.length) return partyError(400, 'partycrm_invalid_transition_roles', 'Выберите действующие должности компании')
    const Companies = await getPartyCompanyModel()
    const revision = Number(previous.revision || 0)
    const updated = await Companies.findOneAndUpdate({ _id: context.tenantId, ...(revision ? { 'settings.workflow.revision': revision } : { $or: [{ 'settings.workflow.revision': 0 }, { 'settings.workflow.revision': { $exists: false } }] }) }, { $set: { 'settings.workflow': { ...workflow, revision: revision + 1 } } }, { new: true }).lean()
    if (!updated) return partyError(409, 'partycrm_workflow_changed', 'Этапы изменились в другом окне. Обновите настройки.')
    return NextResponse.json({ success: true, data: updated.settings.workflow })
  } catch (error) { return partyError(error.status || 500, error.code || 'partycrm_workflow_failed', error.status ? error.message : 'Не удалось сохранить этапы') }
}
