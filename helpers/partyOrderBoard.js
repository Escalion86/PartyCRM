import { canPartyAccess } from './partyRolePermissions.js'
import {
  findPartyWorkflowTransition,
  getPartyOrderStage,
} from './partyWorkflow.js'

const manager = (context) =>
  context?.role === 'owner' || (context?.role === 'admin' && !context.position)

export const getPartyOrderBoardStages = (
  context,
  workflow,
  selectedStageId = ''
) => {
  if (
    !canPartyAccess(context, { resource: 'orders' }) ||
    !canPartyAccess(context, { resource: 'orders.workflowStageId' })
  )
    return []
  const allowed = manager(context)
    ? []
    : context.position?.orderScope?.stageIds || []
  return (workflow.stages || []).filter(
    (stage) =>
      (!allowed.length || allowed.includes(stage.id)) &&
      (!selectedStageId || stage.id === selectedStageId)
  )
}

// The rows are already scoped by the order API. A projected row may omit fields
// used by server scope checks; never infer a new server permission from it.
export const getPartyOrderBoardTransitions = (context, workflow, order) => {
  if (
    !canPartyAccess(context, { resource: 'orders.workflowStageId' }) ||
    !canPartyAccess(context, { resource: 'orders', action: 'transition' }) ||
    !order?._id ||
    !Number.isFinite(+new Date(order.updatedAt)) ||
    order.workflowTransitionAvailable === false ||
    (!order.status && order.workflowTransitionAvailable !== true) ||
    ['closed', 'canceled'].includes(order.status)
  )
    return []
  return (workflow.stages || []).filter(
    (stage) =>
      stage.id !== getPartyOrderStage(order, workflow) &&
      findPartyWorkflowTransition({
        workflow,
        order,
        toStageId: stage.id,
        context,
      })
  )
}

// Independent column requests can observe a move at different moments. Retain
// the most recent DTO once, and never move a row into a column outside the scope.
export const projectPartyOrderBoardColumns = (columns, stages, workflow) => {
  const latest = new Map()
  for (const stage of stages) {
    for (const order of columns[stage.id]?.orders || []) {
      const previous = latest.get(String(order._id))
      if (
        !previous ||
        +new Date(order.updatedAt || 0) >= +new Date(previous.updatedAt || 0)
      )
        latest.set(String(order._id), order)
    }
  }
  return Object.fromEntries(
    stages.map((stage) => [
      stage.id,
      {
        ...columns[stage.id],
        orders: [...latest.values()].filter(
          (order) => getPartyOrderStage(order, workflow) === stage.id
        ),
      },
    ])
  )
}

export const resolvePartyOrderDeepLink = (
  params,
  { companies = [], fixedCompanyId = '', fallbackCompanyId = '' } = {}
) => {
  const requestedCompany = params.get('companyId') || ''
  const orderId = params.get('orderId') || ''
  const allowed = (id) =>
    fixedCompanyId
      ? String(id) === String(fixedCompanyId)
      : companies.some((company) => String(company.id) === String(id))
  const fallback =
    fixedCompanyId ||
    (allowed(fallbackCompanyId) ? fallbackCompanyId : companies[0]?.id || '')
  if (requestedCompany && !allowed(requestedCompany))
    return {
      companyId: fallback,
      orderId: '',
      error:
        'У вашей должности нет доступа к компании из ссылки. Заказ не открыт.',
    }
  if (orderId && !/^[a-f\d]{24}$/i.test(orderId))
    return {
      companyId: requestedCompany || fallback,
      orderId: '',
      error: 'В ссылке указан некорректный заказ.',
    }
  return { companyId: requestedCompany || fallback, orderId, error: '' }
}
