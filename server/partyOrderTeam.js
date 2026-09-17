import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { canPartyOperationalPermission } from '@helpers/partyOperationalPermissions'
import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { getInitialPartyAssignmentConfirmationStatus } from '@helpers/partyOrderAssignments'
import { getPartyRequestContext, isValidObjectId, partyError } from './partyApi'
import { getPartyOrderModel, getPartyStaffModel } from './partyModels'
import { findPartyOrderConflicts, hasPartyOrderConflicts } from './partyOrderConflicts'
import { getPartySharedLocationOrderIds } from './partyRelatedOrders'
import { recordPartyOrderAudit } from './partyAuditLog'
import { syncPartyOrderCalendarAfterCrud } from './partyOrderCalendarHooks'
import { sendPartyPerformerAssignmentPushes } from './partyPerformerPush'

const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }) }
const conflict = () => fail(409, 'partycrm_order_revision_conflict', 'Заказ уже изменился. Обновите состав перед сохранением.')
const openStatuses = ['draft', 'active']
const titleOf = (staff) => [staff?.firstName, staff?.secondName].filter(Boolean).join(' ') || 'Сотрудник'
const safeOrder = (order) => ({ _id: String(order._id), title: order.title || '', serviceTitle: order.serviceTitle || '', eventDate: order.eventDate || null, dateEnd: order.dateEnd || null, status: order.status })
export const getPartyOrderTeamVersion = (order) => createHash('sha256').update(JSON.stringify(order)).digest('hex')

export const partyOrderTeamRoute = (handler) => async (req, params) => {
  const { context, error } = await getPartyRequestContext({ req })
  if (error) return error
  if (!canPartyOperationalPermission(context, 'orders.assignments')) return partyError(403, 'partycrm_forbidden', 'Недостаточно прав для назначения исполнителей', 'permission')
  try { return NextResponse.json({ success: true, data: await handler(req, context, params) }) }
  catch (error) { return partyError(error.status || 500, error.status ? error.code : 'partycrm_order_team_failed', error.status ? error.message : 'Не удалось обработать состав команды') }
}

export const listPartyOrderTeam = async ({ tenantId, cursor = '' }) => {
  if (cursor && !isValidObjectId(cursor)) fail(400, 'partycrm_invalid_cursor', 'Некорректный указатель страницы')
  const Orders = await getPartyOrderModel()
  const orders = await Orders.find({ tenantId, status: { $in: openStatuses }, ...(cursor ? { _id: { $lt: cursor } } : {}) }).select('_id title serviceTitle eventDate dateEnd status').sort({ _id: -1 }).limit(51).lean()
  return { orders: orders.slice(0, 50).map(safeOrder), nextCursor: orders.length > 50 ? String(orders[49]._id) : null }
}

const loadOrder = async ({ tenantId, orderId }) => {
  if (!isValidObjectId(orderId)) fail(400, 'partycrm_invalid_order_id', 'Некорректный id заказа')
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({ _id: orderId, tenantId }).lean()
  if (!order) fail(404, 'partycrm_order_not_found', 'Заказ не найден')
  if (!openStatuses.includes(order.status)) fail(409, 'partycrm_order_team_closed', 'Состав можно менять только у открытого заказа')
  return { Orders, order }
}
const loadStaff = async (tenantId, order) => {
  const Staff = await getPartyStaffModel()
  return Staff.find({ tenantId, $or: [{ status: 'active' }, { _id: { $in: (order.assignedStaff || []).map((a) => a.staffId) } }] }).select('_id firstName secondName status authUserId linkedAuthUserId').lean()
}
const detail = (order, staff) => ({
  ...safeOrder(order), expectedVersion: getPartyOrderTeamVersion(order),
  assignedStaff: (order.assignedStaff || []).map((a) => ({ staffId: String(a.staffId), role: a.role || 'performer', confirmationStatus: a.confirmationStatus || 'pending', title: titleOf(staff.find((s) => String(s._id) === String(a.staffId))) })),
  candidates: staff.filter((s) => s.status === 'active').map((s) => ({ _id: String(s._id), title: titleOf(s) })),
})
export const getPartyOrderTeam = async (args) => {
  const { order } = await loadOrder(args)
  return detail(order, await loadStaff(args.tenantId, order))
}

export const updatePartyOrderTeam = async ({ context, orderId, body }) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['assignedStaff', 'expectedVersion'].includes(key)) || typeof body.expectedVersion !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedVersion) || !Array.isArray(body.assignedStaff) || body.assignedStaff.length > 100 || body.assignedStaff.some((a) => !a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).some((key) => !['staffId', 'role'].includes(key)) || typeof a.staffId !== 'string' || !/^[a-f0-9]{24}$/.test(a.staffId) || !['performer', 'admin', 'assistant'].includes(a.role)) || new Set(body.assignedStaff.map((a) => a.staffId)).size !== body.assignedStaff.length)
    fail(400, 'partycrm_invalid_team', 'Укажите исполнителей, их роли и текущую версию заказа')
  const { Orders, order } = await loadOrder({ tenantId: context.tenantId, orderId })
  if (getPartyOrderTeamVersion(order) !== body.expectedVersion) conflict()
  const staff = await loadStaff(context.tenantId, order)
  const previous = order.assignedStaff || []
  const assignedStaff = body.assignedStaff.map((a) => {
    const retained = previous.find((old) => String(old.staffId) === a.staffId)
    if (retained) return { ...retained, role: a.role }
    const member = staff.find((s) => String(s._id) === a.staffId && s.status === 'active')
    if (!member) fail(400, 'partycrm_staff_unavailable', 'Можно назначить только активного сотрудника этой компании')
    return { staffId: a.staffId, role: a.role, payoutAmount: 0, payoutStatus: 'planned', confirmationStatus: getInitialPartyAssignmentConfirmationStatus(member), report: { status: 'draft', text: '', files: [] } }
  })
  if (JSON.stringify(previous) === JSON.stringify(assignedStaff)) return detail(order, staff)
  // Reports and financial records can be created concurrently without touching the order.
  // This narrow permission therefore never removes a persisted assignment.
  if (previous.some((a) => !assignedStaff.some((next) => String(next.staffId) === String(a.staffId))))
    fail(409, 'partycrm_assignment_protected', 'Снять уже назначенного исполнителя может администратор в редакторе заказа.')
  const conflicts = await findPartyOrderConflicts({ PartyOrders: Orders, tenantId: context.tenantId, payload: { ...order, assignedStaff }, excludeOrderId: orderId, sharedLocationOrderIds: await getPartySharedLocationOrderIds({ tenantId: context.tenantId, orderId }) })
  if (hasPartyOrderConflicts(conflicts)) fail(409, 'partycrm_order_conflict', 'Найдены пересечения по площадке или исполнителю. Проверьте расписание с администратором.')
  const guard = getPartyOrderWriteGuard(order)
  // $literal preserves legacy BSON without Mongoose injecting subdocument defaults.
  const saved = await Orders.findOneAndUpdate({ _id: orderId, tenantId: context.tenantId, ...guard, $and: [...(guard.$and || []), Object.hasOwn(order, 'assignedStaff') ? { $expr: { $eq: [{ $ifNull: ['$assignedStaff', null] }, { $literal: order.assignedStaff }] } } : { assignedStaff: { $exists: false } }] }, { $set: { assignedStaff }, $inc: { commercialRevision: 1 } }, { returnDocument: 'after', runValidators: true }).lean()
  if (!saved) conflict()
  const [audit, calendar, push] = await Promise.allSettled([
    recordPartyOrderAudit({ context, order: saved, previousOrder: order, action: 'order_updated', summary: 'Изменил состав исполнителей' }),
    syncPartyOrderCalendarAfterCrud({ tenantId: context.tenantId, orderId, previousOrder: order }),
    sendPartyPerformerAssignmentPushes({ tenantId: context.tenantId, company: context.company, previousOrder: order, nextOrder: saved, source: 'party-order-team' }),
  ])
  const warnings = []
  if (audit.status === 'rejected' || audit.value === null) warnings.push('Состав сохранён, но запись истории не подтверждена. Сообщите администратору.')
  if (calendar.status === 'rejected' || ['failed', 'hook_failed'].includes(calendar.value?.status)) warnings.push('Состав сохранён, но календарь не удалось обновить. Сообщите администратору.')
  if (push.status === 'rejected' || push.value?.failed) warnings.push('Состав сохранён, но не все уведомления доставлены. Свяжитесь с исполнителями.')
  let refreshed = saved
  try { refreshed = await Orders.findOne({ _id: orderId, tenantId: context.tenantId }).lean() || saved }
  catch { warnings.push('Состав сохранён. Обновите заказ перед следующим изменением.') }
  return { ...detail(refreshed, staff), warnings }
}
