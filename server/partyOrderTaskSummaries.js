import { getPartyTaskModel } from './partyTaskModels'
import { canReadTask } from './partyTasks'
import { canPartyAccess } from '../helpers/partyRolePermissions'

// Read-only projection; does not migrate records or create calendar effects.
export const withPartyOrderTaskSummaries = async ({ context, orders, now = new Date() }) => {
  const readable = orders.filter((order) => canPartyAccess(context, { resource: 'orders', order }) && canPartyAccess(context, { resource: 'tasks', order }))
  const Tasks = readable.length ? await getPartyTaskModel() : null
  const tasks = Tasks ? await Tasks.find({ tenantId: context.tenantId, orderId: { $in: readable.map((order) => order._id) } }).select('_id tenantId orderId locationId title dueAt status sourceKey assigneeStaffIds assigneeRoleId createdByStaffId createdByUserId').lean() : []
  const orderMap = new Map(readable.map((order) => [String(order._id), order]))
  const byOrder = new Map(readable.map((order) => [String(order._id), []]))
  const migrated = new Set(tasks.map((task) => task.sourceKey).filter(Boolean))
  for (const task of tasks) {
    const order = orderMap.get(String(task.orderId))
    if (order && ['new', 'in_progress'].includes(task.status) && canReadTask(context, task, order)) byOrder.get(String(order._id)).push(task)
  }
  for (const order of readable) {
    for (const [index, item] of (order.additionalEvents || []).entries()) {
      if (item.done || migrated.has(`order:${order._id}:additional:${item._id || index}`)) continue
      const staffId = item.responsibleStaffId || order.responsibleStaffId
      const task = { tenantId: context.tenantId, orderId: order._id, locationId: order.locationId, title: item.title || 'Задача', dueAt: item.date, assigneeStaffIds: staffId ? [staffId] : [] }
      if (canReadTask(context, task, order)) byOrder.get(String(order._id)).push(task)
    }
  }
  return orders.map((order) => {
    const { taskSummary: _old, ...safe } = order
    const rows = byOrder.get(String(order._id))
    if (!rows) return safe
    const dated = rows.filter((task) => task.dueAt && Number.isFinite(+new Date(task.dueAt))).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))
    return { ...safe, taskSummary: { openCount: rows.length, overdueCount: dated.filter((task) => +new Date(task.dueAt) < +now).length, nearestTask: dated[0] ? { title: dated[0].title, dueAt: dated[0].dueAt } : null } }
  })
}
