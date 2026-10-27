import { getPartyTaskModel } from '@server/partyTaskModels'
import { getPartyOrderModel, getPartyStaffModel, getPartyRoleModel, getPartyLocationModel } from '@server/partyModels'
import { canPartyAccess, buildPartyOrderAccessFilter } from '@helpers/partyRolePermissions'
import { taskFailure } from '@helpers/partyTasks'
import { withTaskContext, taskJson, taskId, canManageTask, serializeTask, ensurePartyOrderTasks, taskStaff, loadTaskOrder, createPartyTaskForContext, canAccessTaskLocation, canReadTask, buildPartyTaskListAccessFilter } from '@server/partyTasks'

export const dynamic = 'force-dynamic'

export const GET = withTaskContext(async (req, context) => {
  const params = new URL(req.url).searchParams
  const Tasks = await getPartyTaskModel()
  const filter = await buildPartyTaskListAccessFilter(context)
  if (params.get('orderId')) {
    filter.orderId = taskId(params.get('orderId'))
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
  if (params.get('status') && ['new', 'in_progress', 'done', 'canceled'].includes(params.get('status'))) filter.status = params.get('status')
  const limit = 50
  if (params.get('cursor')) filter._id = { $lt: taskId(params.get('cursor')) }
  const rows = await Tasks.find(filter).sort({ _id: -1 }).limit(limit + 1).lean()
  const page = rows.slice(0, limit)
  const [Orders, Staff] = await Promise.all([getPartyOrderModel(), getPartyStaffModel()])
  const orders = await Orders.find({ tenantId: context.tenantId, _id: { $in: page.map((task) => task.orderId).filter(Boolean) } }).lean()
  const orderById = new Map(orders.map((order) => [String(order._id), order]))
  const visiblePage = page.filter((task) => canReadTask(context, task, orderById.get(String(task.orderId))))
  const staff = await Staff.find({ tenantId: context.tenantId, status: 'active', ...(!canPartyAccess(context, { resource: 'tasks', action: 'assign' }) ? { _id: { $in: [...new Set([context.staff._id, ...visiblePage.flatMap((task) => task.assigneeStaffIds || []), ...visiblePage.map((task) => task.completedByStaffId)].filter(Boolean))] } } : {}) }).select('_id firstName secondName role positionId').lean()
  const staffById = new Map(staff.map((person) => [String(person._id), [person.firstName, person.secondName].filter(Boolean).join(' ') || 'Сотрудник']))
  const assignees = staff.map((person) => ({ _id: String(person._id), name: staffById.get(String(person._id)), positionId: person.positionId ? String(person.positionId) : null }))
  const Roles = await getPartyRoleModel()
  const roles = canPartyAccess(context, { resource: 'tasks', action: 'assign' }) ? await Roles.find({ tenantId: context.tenantId, active: true }).select('_id title').sort({ title: 1 }).lean() : []
  const roots = await Tasks.find({ tenantId: context.tenantId, _id: { $in: page.map((task) => task.seriesId).filter(Boolean) } }).lean()
  const rootsById = new Map(roots.map((task) => [String(task._id), task]))
  const Locations = await getPartyLocationModel()
  const locations = await Locations.find({ tenantId: context.tenantId, status: { $ne: 'archived' } }).select('_id title').lean()
  return taskJson({
    tasks: visiblePage.map((task) => serializeTask(context, task, { order: orderById.get(String(task.orderId)), staffById, seriesRoot: rootsById.get(String(task.seriesId)) })),
    staff: assignees, roles: roles.map((role) => ({ _id: String(role._id), title: role.title })), currentStaffId: String(context.staff._id), currentRoleId: taskStaff(context).positionId || null,
    canCreate: canPartyAccess(context, { resource: 'tasks', action: 'create' }),
    canManage: canManageTask(context), nextCursor: rows.length > limit ? String(page.at(-1)._id) : null,
    locations: locations.filter((location) => canAccessTaskLocation(context, { locationId: location._id })).map((location) => ({ _id: String(location._id), title: location.title })),
  })
})

export const POST = withTaskContext(async (req, context) => {
  const result = await createPartyTaskForContext(context, await req.json(), req.headers.get('idempotency-key') || '')
  return taskJson(serializeTask(context, result.task, { order: await loadTaskOrder(context, result.task) }), result.created ? 201 : 200)
})
