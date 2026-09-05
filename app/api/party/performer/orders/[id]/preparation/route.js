import { NextResponse } from 'next/server'
import { getPartyOrderModel } from '@server/partyModels'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { isValidObjectId, parseJsonBody, partyError } from '@server/partyApi'
import { buildPerformerPreparationView } from '@server/partyOrderPreparation'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

const getId = async (params) => (await params)?.id
const resolveAccess = async (req, params) => {
  const { sessionUser, memberships } = await getPartyMembershipContext({ excludeLocationOwners: true })
  if (!sessionUser?._id) return { error: partyError(401, 'unauthorized', 'Не авторизован', 'auth') }
  const orderId = await getId(params)
  const staffId = new URL(req.url).searchParams.get('staffId') || ''
  if (!isValidObjectId(orderId) || !isValidObjectId(staffId)) return { error: partyError(400, 'partycrm_invalid_preparation_target', 'Некорректный заказ или сотрудник') }
  const membership = memberships.find((item) => String(item.staffId) === staffId && item.status === 'active')
  if (!membership) return { error: partyError(403, 'partycrm_performer_staff_access_denied', 'Нет доступа к этой карточке сотрудника', 'auth') }
  return { sessionUser, membership, orderId, staffId }
}

const loadOrder = async (membership, orderId, staffId) => {
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({ _id: orderId, tenantId: membership.tenantId, status: { $nin: ['canceled'] }, $or: [{ 'assignedStaff.staffId': staffId }, { 'preparation.items.responsibleStaffId': staffId }] }).select('_id title status assignedStaff preparation').lean()
  return { Orders, order }
}

export async function GET(req, { params }) {
  const access = await resolveAccess(req, params)
  if (access.error) return access.error
  const { order } = await loadOrder(access.membership, access.orderId, access.staffId)
  if (!order) return partyError(404, 'partycrm_performer_order_not_found', 'Подготовка заказа не найдена')
  try { return NextResponse.json({ success: true, data: buildPerformerPreparationView(order, access.staffId) }) }
  catch (cause) { return partyError(cause.status || 403, 'partycrm_preparation_access_denied', cause.message, 'permission') }
}

export async function PATCH(req, { params }) {
  const access = await resolveAccess(req, params)
  if (access.error) return access.error
  const body = await parseJsonBody(req)
  const allowed = body?.action === 'set_item_status' ? ['action', 'itemId', 'status'] : body?.action === 'acknowledge_address' ? ['action'] : []
  if (!allowed.length || Object.keys(body || {}).some((key) => !allowed.includes(key))) return partyError(400, 'partycrm_invalid_preparation_action', 'Некорректное действие подготовки', 'validation')
  const { Orders, order: current } = await loadOrder(access.membership, access.orderId, access.staffId)
  if (!current || ['closed', 'canceled'].includes(current.status)) return partyError(404, 'partycrm_performer_order_not_found', 'Активная подготовка заказа не найдена')
  let order
  let mutated = false
  const now = new Date()
  if (body.action === 'set_item_status') {
    if (!isValidObjectId(body.itemId) || !['pending', 'done'].includes(body.status)) return partyError(400, 'partycrm_invalid_preparation_item', 'Некорректный пункт или статус', 'validation')
    order = await Orders.findOneAndUpdate({ _id: access.orderId, tenantId: access.membership.tenantId, status: { $nin: ['closed', 'canceled'] }, 'preparation.items': { $elemMatch: { _id: body.itemId, responsibleStaffId: access.staffId, status: { $ne: body.status } } } }, { $set: { 'preparation.items.$[item].status': body.status, 'preparation.items.$[item].completedAt': body.status === 'done' ? now : null, 'preparation.items.$[item].completedByStaffId': body.status === 'done' ? access.staffId : null, 'preparation.updatedAt': now, 'preparation.updatedByStaffId': access.staffId }, $inc: { 'preparation.revision': 1 } }, { arrayFilters: [{ 'item._id': body.itemId, 'item.responsibleStaffId': access.staffId }], returnDocument: 'after' }).select('_id title status assignedStaff preparation').lean()
    const changed = order?.preparation?.items?.some((item) => String(item._id) === String(body.itemId) && item.status === body.status && String(item.responsibleStaffId) === access.staffId)
    if (!changed) {
      const existing = current.preparation?.items?.some((item) => String(item._id) === String(body.itemId) && String(item.responsibleStaffId) === access.staffId && item.status === body.status)
      order = existing ? current : null
    } else mutated = true
  } else {
    const assigned = (current.assignedStaff || []).some((item) => String(item.staffId) === access.staffId)
    if (!assigned || !current.preparation?.addressChange?.before || !current.preparation?.addressChange?.after) return partyError(403, 'partycrm_address_ack_denied', 'Подтверждение адреса недоступно', 'permission')
    order = await Orders.findOneAndUpdate({ _id: access.orderId, tenantId: access.membership.tenantId, status: { $nin: ['closed', 'canceled'] }, 'assignedStaff.staffId': access.staffId, 'preparation.addressChange.acknowledgements.staffId': { $ne: access.staffId } }, { $push: { 'preparation.addressChange.acknowledgements': { staffId: access.staffId, acknowledgedAt: now } }, $set: { 'preparation.updatedAt': now, 'preparation.updatedByStaffId': access.staffId }, $inc: { 'preparation.revision': 1 } }, { returnDocument: 'after' }).select('_id title status assignedStaff preparation').lean()
    if (!order) order = current
    else mutated = true
  }
  if (!order) return partyError(404, 'partycrm_preparation_item_not_found', 'Назначенный пункт подготовки не найден')
  if (mutated) await recordPartyOrderAudit({ context: { tenantId: access.membership.tenantId, role: access.membership.role, staff: access.membership.staff, sessionUser: access.sessionUser }, order, previousOrder: current, action: body.action === 'set_item_status' ? 'order_preparation_item_updated' : 'order_address_acknowledged', summary: body.action === 'set_item_status' ? 'Обновил свой пункт подготовки' : 'Подтвердил ознакомление с новым адресом', changes: [], metadata: { staffId: access.staffId, itemId: body.itemId || null, status: body.status || null } })
  return NextResponse.json({ success: true, data: buildPerformerPreparationView(order, access.staffId) })
}
