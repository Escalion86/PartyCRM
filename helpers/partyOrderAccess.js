import { canPartyAccess } from './partyRolePermissions.js'

const financialBlockerResources = {
  client_debt: 'finance.payments', unpaid_payouts: 'finance.payouts',
}

export const maskPartyOrderBlockers = (context, order, blockers = []) => blockers.map((blocker) => {
  const resource = financialBlockerResources[blocker.code]
  if (resource && !canPartyAccess(context, { resource, order })) return { code: blocker.code, message: 'Есть незавершённые финансовые обязательства. Подробности доступны уполномоченному сотруднику.' }
  if ((blocker.code === 'open_tasks' || blocker.code === 'open_assigned_tasks') && !canPartyAccess(context, { resource: 'tasks', order })) return { code: blocker.code, message: 'Есть незавершённые задачи. Обратитесь к уполномоченному сотруднику.' }
  return blocker
})

const summaryResources = {
  contractAmount: 'finance.clientAmount', incomeTotal: 'finance.payments', balanceDue: 'finance.payments', paymentStatus: 'finance.payments',
  expenseTotal: 'finance.expenses', payoutTotal: 'finance.payouts', paidPayoutTotal: 'finance.payouts', unpaidPayoutTotal: 'finance.payouts', unpaidPayoutCount: 'finance.payouts', payoutStatus: 'finance.payouts', grossMargin: 'finance.margin',
}
export const maskPartyOrderFinancialSummary = (context, order, summary = {}) => Object.fromEntries(Object.entries(summary).filter(([key]) => summaryResources[key] && canPartyAccess(context, { resource: summaryResources[key], order })))

export const hasUnrestrictedPartyOrderAccess = (context) => {
  if (context.role === 'owner') return true
  const scope = context.position?.orderScope || {}
  return context.role === 'admin' && (!context.position || context.position.systemKey === 'admin') &&
    !scope.stageIds?.length && !scope.statuses?.length && !scope.locationIds?.length && !scope.assignedOnly && scope.includeUnlocated !== false &&
    ['orders', 'orders.title', 'orders.eventDate', 'orders.dateEnd', 'orders.client.name', 'orders.locationId', 'orders.assignedStaff'].every((resource) => canPartyAccess(context, { resource }))
}

export const maskPartyOrderConflicts = (context, conflicts) => {
  if (hasUnrestrictedPartyOrderAccess(context)) return conflicts
  return Object.fromEntries(Object.entries(conflicts || {}).map(([key, value]) => [key, Array.isArray(value) ? value.map(() => ({ message: 'Ресурс занят другим заказом. Подробности доступны уполномоченному сотруднику.' })) : Boolean(value)]))
}
