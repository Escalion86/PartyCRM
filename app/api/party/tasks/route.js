import { getPartyTaskModel } from '@server/partyTaskModels'
import { getPartyOrderModel, getPartyStaffModel, getPartyRoleModel, getPartyLocationModel } from '@server/partyModels'
import { canPartyAccess, buildPartyOrderAccessFilter } from '@helpers/partyRolePermissions'
import { taskFailure } from '@helpers/partyTasks'
import { parsePartyTaskQuery, buildPartyTaskQueryFilter, matchesPartyTaskQuery } from '@helpers/partyTaskQuery'
import { withTaskContext, taskJson, canManageTask, serializeTask, ensurePartyOrderTasks, taskStaff, loadTaskOrder, createPartyTaskForContext, canAccessTaskLocation, canReadTask, buildPartyTaskListAccessFilter } from '@server/partyTasks'

export const dynamic = 'force-dynamic'

export const GET = withTaskContext(async (req, context) => {
  const params = new URL(req.url).searchParams
  const query = parsePartyTaskQuery(params, { timeZone: context.company?.settings?.timeZone })
  const Tasks = await getPartyTaskModel()
  const filter = await buildPartyTaskListAccessFilter(context)
  if (query.orderId) {
    filter.orderId = query.orderId
    const Orders = await getPartyOrderModel()
    const order = await Orders.findOne({ _id: filter.orderId, tenantId: context.tenantId }).lean()
    if (!order || !canPartyAccess(context, { resource: 'orders', order })) taskFailure('Заказ не найден', 404)
    await ensurePartyOrderTasks({ tenantId: context.tenantId, order })
  } else {
    const Orders = await getPartyOrderModel()
    const scoped = buildPartyOrderAccessFilter(context)
    const legacyOrders = await Orders.find({ ...scoped, $and: [...(scoped.$and || []), { status: { $in: ['draft', 'active'] } }, { $or: [{ 'additionalEvents.0': { $exists: true } }, { 'preparation.items.0': { $exists: true } }] }] }).sort({ _id: -1 }).limit(120).lean()
    for (const order of legacyOrders) await ensurePartyOrderTasks({ tenantId: context.tenantId, order })
  }
  const limit = 50
  const [Orders, Staff] = await Promise.all([getPartyOrderModel(), getPartyStaffModel()])
  const clauses = buildPartyTaskQueryFilter(query, context)
  const page = []
  const orderById = new Map()
  let cursor = query.cursor
  let nextCursor = null
  let scanned = 0
  // Filter the projected DTO, not hidden order/task fields. Bound work per request,
  // retaining a continuation even when a sparse search yields no matches yet.
  while (scanned < 1000 && page.length <= limit) {
    const rows = await Tasks.find({
      ...filter,
      $and: [...(filter.$and || []), ...clauses, ...(cursor ? [{ _id: { $lt: cursor } }] : [])],
    }).sort({ _id: -1 }).limit(100).lean()
    if (!rows.length) { nextCursor = null; break }
    const orderIds = [...new Set(rows.map((task) => task.orderId).filter(Boolean).map(String))].filter((id) => !orderById.has(id))
    if (orderIds.length) {
      const orders = await Orders.find({ tenantId: context.tenantId, _id: { $in: orderIds } }).lean()
      for (const order of orders) orderById.set(String(order._id), order)
    }
    for (const task of rows) {
      scanned += 1
      cursor = String(task._id)
      const order = orderById.get(String(task.orderId))
      if (canReadTask(context, task, order) && matchesPartyTaskQuery(serializeTask(context, task, { order }), query, context)) page.push(task)
      if (page.length > limit) {
        nextCursor = String(page[limit - 1]._id)
        break
      }
    }
    if (page.length > limit) break
    nextCursor = rows.length === 100 ? cursor : null
    if (!nextCursor) break
  }
  const visiblePage = page.slice(0, limit)
  const staff = await Staff.find({ tenantId: context.tenantId, status: 'active', ...(!canPartyAccess(context, { resource: 'tasks', action: 'assign' }) ? { _id: { $in: [...new Set([context.staff._id, ...visiblePage.flatMap((task) => task.assigneeStaffIds || []), ...visiblePage.map((task) => task.completedByStaffId)].filter(Boolean))] } } : {}) }).select('_id firstName secondName role positionId').lean()
  const staffById = new Map(staff.map((person) => [String(person._id), [person.firstName, person.secondName].filter(Boolean).join(' ') || 'Сотрудник']))
  const assignees = staff.map((person) => ({ _id: String(person._id), name: staffById.get(String(person._id)), positionId: person.positionId ? String(person.positionId) : null }))
  const Roles = await getPartyRoleModel()
  const roles = canPartyAccess(context, { resource: 'tasks', action: 'assign' }) ? await Roles.find({ tenantId: context.tenantId, active: true }).select('_id title').sort({ title: 1 }).lean() : []
  const roots = await Tasks.find({ tenantId: context.tenantId, _id: { $in: visiblePage.map((task) => task.seriesId).filter(Boolean) } }).lean()
  const rootsById = new Map(roots.map((task) => [String(task._id), task]))
  const Locations = await getPartyLocationModel()
  const locations = await Locations.find({ tenantId: context.tenantId, status: { $ne: 'archived' } }).select('_id title').lean()
  return taskJson({
    tasks: visiblePage.map((task) => serializeTask(context, task, { order: orderById.get(String(task.orderId)), staffById, seriesRoot: rootsById.get(String(task.seriesId)) })),
    staff: assignees, roles: roles.map((role) => ({ _id: String(role._id), title: role.title })), currentStaffId: String(context.staff._id), currentRoleId: taskStaff(context).positionId || null,
    canCreate: canPartyAccess(context, { resource: 'tasks', action: 'create' }),
    canManage: canManageTask(context), nextCursor,
    locations: locations.filter((location) => canAccessTaskLocation(context, { locationId: location._id })).map((location) => ({ _id: String(location._id), title: location.title })),
  })
})

export const POST = withTaskContext(async (req, context) => {
  const result = await createPartyTaskForContext(context, await req.json(), req.headers.get('idempotency-key') || '')
  return taskJson(serializeTask(context, result.task, { order: await loadTaskOrder(context, result.task) }), result.created ? 201 : 200)
})
