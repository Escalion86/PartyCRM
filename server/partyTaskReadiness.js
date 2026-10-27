import { getPartyTaskModel } from './partyTaskModels'
import { ensurePartyOrderTasks } from './partyTasks'

export const getPartyTaskOrderReadiness = async ({
  tenantId,
  order,
  session,
}) => {
  await ensurePartyOrderTasks({ tenantId, order, session })
  const Tasks = await getPartyTaskModel()
  const query = Tasks.find({ tenantId, orderId: order._id }).select(
    'sourceKey status'
  )
  const tasks = await (session ? query.session(session) : query).lean()
  const bySource = new Map(
    tasks.filter((task) => task.sourceKey).map((task) => [task.sourceKey, task])
  )
  const knownSources = new Set()
  const done = (task) => ['done', 'canceled'].includes(task.status)
  const additionalEvents = (order.additionalEvents || []).map((item, index) => {
    const key = `order:${order._id}:additional:${item._id || index}`
    knownSources.add(key)
    return bySource.has(key) ? { ...item, done: done(bySource.get(key)) } : item
  })
  const items = (order.preparation?.items || []).map((item, index) => {
    const key = `order:${order._id}:preparation:${item._id || item.id || index}`
    knownSources.add(key)
    return bySource.has(key)
      ? { ...item, status: done(bySource.get(key)) ? 'done' : 'pending' }
      : item
  })
  const open = tasks.filter(
    (task) =>
      !knownSources.has(task.sourceKey) &&
      ['new', 'in_progress'].includes(task.status)
  )
  return {
    order: {
      ...order,
      additionalEvents,
      preparation: { ...order.preparation, items },
    },
    blockers: open.length
      ? [
          {
            code: 'open_assigned_tasks',
            message: `Открытые задачи заказа: ${open.length}`,
            count: open.length,
          },
        ]
      : [],
  }
}
