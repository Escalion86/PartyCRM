import { NextResponse } from 'next/server'
import { getPartyOrderModel, getPartyStaffModel } from '@server/partyModels'
import { getPartyRequestContext, isValidObjectId, parseJsonBody, partyError } from '@server/partyApi'

const candidates = async (order, tenantId) => {
  const ids = (order.assignedStaff || [])
    .filter((item) => item.confirmationStatus !== 'declined')
    .map((item) => item.staffId)
  const Staff = await getPartyStaffModel()
  return Staff.find({ tenantId, _id: { $in: ids }, status: 'active' })
    .select('_id firstName secondName').lean()
}

const responseData = (order, staff) => ({
  coordinatorStaffId: staff.some((item) => String(item._id) === String(order.reportCoordinatorStaffId))
    ? String(order.reportCoordinatorStaffId) : null,
  revision: order.reportCoordinatorRevision || 0,
  staff,
  suggested: staff.length > 4,
})

async function load(req, params) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return { error }
  const id = (await params)?.id
  if (!isValidObjectId(id)) return { error: partyError(400, 'partycrm_invalid_order_id', 'Некорректный id заказа') }
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({ _id: id, tenantId: context.tenantId }).lean()
  if (!order) return { error: partyError(404, 'partycrm_order_not_found', 'Заказ не найден') }
  return { context, id, Orders, order }
}

async function getCoordinator(req, { params }) {
  const state = await load(req, params)
  if (state.error) return state.error
  return NextResponse.json({ success: true, data: responseData(state.order, await candidates(state.order, state.context.tenantId)) })
}

async function patchCoordinator(req, { params }) {
  const state = await load(req, params)
  if (state.error) return state.error
  const { context, id, Orders, order } = state
  if (order.status === 'canceled') return partyError(409, 'partycrm_order_canceled', 'Нельзя назначить координатора отменённого заказа')
  const body = await parseJsonBody(req)
  if (!Number.isSafeInteger(body?.expectedRevision) || body.expectedRevision < 0 ||
    !(body.staffId === null || (typeof body.staffId === 'string' && isValidObjectId(body.staffId)))) {
    return partyError(400, 'partycrm_invalid_report_coordinator', 'Укажите координатора и текущую версию назначения')
  }
  const staff = await candidates(order, context.tenantId)
  if (body.staffId && !staff.some((item) => String(item._id) === body.staffId)) {
    return partyError(400, 'partycrm_report_coordinator_not_assigned', 'Координатор должен быть активным участником команды заказа')
  }
  const filter = {
    _id: id, tenantId: context.tenantId, status: { $ne: 'canceled' },
    ...(body.expectedRevision === 0
      ? { $or: [{ reportCoordinatorRevision: 0 }, { reportCoordinatorRevision: { $exists: false } }] }
      : { reportCoordinatorRevision: body.expectedRevision }),
    ...(body.staffId ? { assignedStaff: { $elemMatch: { staffId: body.staffId, confirmationStatus: { $ne: 'declined' } } } } : {}),
  }
  const updated = await Orders.findOneAndUpdate(filter, {
    $set: { reportCoordinatorStaffId: body.staffId },
    $inc: { reportCoordinatorRevision: 1 },
  }, { returnDocument: 'after', runValidators: true }).lean()
  if (!updated) return partyError(409, 'partycrm_report_coordinator_conflict', 'Назначение или состав команды изменились. Обновите данные и повторите выбор.')
  return NextResponse.json({ success: true, data: responseData(updated, await candidates(updated, context.tenantId)) })
}

async function respond(handler, req, options) {
  let response
  try {
    response = await handler(req, options)
  } catch {
    response = partyError(500, 'partycrm_report_coordinator_failed', 'Не удалось обработать назначение координатора. Повторите попытку.')
  }
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function GET(req, options) {
  return respond(getCoordinator, req, options)
}

export async function PATCH(req, options) {
  return respond(patchCoordinator, req, options)
}
