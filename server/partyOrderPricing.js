import { NextResponse } from 'next/server'
import { canPartyOperationalPermission } from '@helpers/partyOperationalPermissions'
import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { getPartyRequestContext, isValidObjectId, partyError } from './partyApi'
import { getPartyOrderModel } from './partyModels'
import { recordPartyOrderAudit } from './partyAuditLog'
import { syncPartyOrderCalendarAfterCrud } from './partyOrderCalendarHooks'
import { syncPartyOrderInventory } from './partyInventory'

const fail = (status, code, message) => {
  throw Object.assign(new Error(message), { status, code })
}
const conflict = () => fail(409, 'partycrm_order_revision_conflict', 'Заказ уже изменился. Обновите его перед сохранением.')
const openStatuses = ['draft', 'active']
const projection = '_id title serviceTitle eventDate status contractAmount commercialRevision orderItems agreedProposal'

export const serializePartyOrderPricing = (order) => ({
  _id: String(order._id),
  title: order.title || '',
  serviceTitle: order.serviceTitle || '',
  eventDate: order.eventDate || null,
  status: order.status,
  contractAmount: Number(order.contractAmount || 0),
  commercialRevision: Number(order.commercialRevision || 0),
  hasOrderItems: Boolean(order.orderItems?.length),
  hasAgreedProposal: Boolean(order.agreedProposal?.proposalId || order.agreedProposal?.snapshotHash),
})

export const partyOrderPricingRoute = (handler) => async (req, params) => {
  const { context, error } = await getPartyRequestContext({ req })
  if (error) return error
  if (!canPartyOperationalPermission(context, 'orders.pricing'))
    return partyError(403, 'partycrm_forbidden', 'Недостаточно прав для изменения стоимости', 'permission')
  try {
    return NextResponse.json({ success: true, data: await handler(req, context, params) })
  } catch (error) {
    return partyError(error.status || 500, error.status ? error.code : 'partycrm_order_pricing_failed', error.status ? error.message : 'Не удалось обработать стоимость заказа')
  }
}

export const listPartyOrderPricing = async ({ tenantId, cursor = '' }) => {
  if (cursor && !isValidObjectId(cursor)) fail(400, 'partycrm_invalid_cursor', 'Некорректный указатель страницы')
  const Orders = await getPartyOrderModel()
  const orders = await Orders.find({ tenantId, status: { $in: openStatuses }, ...(cursor ? { _id: { $lt: cursor } } : {}) }).select(projection).sort({ _id: -1 }).limit(51).lean()
  return { orders: orders.slice(0, 50).map(serializePartyOrderPricing), nextCursor: orders.length > 50 ? String(orders[49]._id) : null }
}

const loadOrder = async ({ tenantId, orderId }) => {
  if (!isValidObjectId(orderId)) fail(400, 'partycrm_invalid_order_id', 'Некорректный id заказа')
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({ _id: orderId, tenantId }).lean()
  if (!order) fail(404, 'partycrm_order_not_found', 'Заказ не найден')
  if (!openStatuses.includes(order.status)) fail(409, 'partycrm_order_pricing_closed', 'Стоимость можно менять только у открытого заказа')
  return { Orders, order }
}

export const getPartyOrderPricing = async (args) => serializePartyOrderPricing((await loadOrder(args)).order)

export const updatePartyOrderPricing = async ({ context, orderId, body }) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['contractAmount', 'expectedRevision'].includes(key)) || !Number.isSafeInteger(body.contractAmount) || body.contractAmount < 0 || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0)
    fail(400, 'partycrm_invalid_pricing', 'Укажите стоимость целым числом рублей и текущую версию заказа')
  const { Orders, order } = await loadOrder({ tenantId: context.tenantId, orderId })
  if (Number(order.commercialRevision || 0) !== body.expectedRevision) conflict()
  if (Number(order.contractAmount || 0) === body.contractAmount) return serializePartyOrderPricing(order)
  const paymentTotal = order.clientPayment && typeof order.clientPayment === 'object' && !Array.isArray(order.clientPayment)
    ? { 'clientPayment.totalAmount': body.contractAmount }
    : { clientPayment: { totalAmount: body.contractAmount } }
  const saved = await Orders.findOneAndUpdate(
    { _id: orderId, tenantId: context.tenantId, ...getPartyOrderWriteGuard(order) },
    { $set: { contractAmount: body.contractAmount, ...paymentTotal, orderItems: [], agreedProposal: {} }, $inc: { commercialRevision: 1 } },
    { returnDocument: 'after', runValidators: true }
  ).lean()
  if (!saved) conflict()
  // These integrations are best-effort; a completed write must not appear failed.
  const [audit, calendar, inventory] = await Promise.allSettled([
    recordPartyOrderAudit({ context, order: saved, previousOrder: order, action: 'order_updated', summary: 'Изменил стоимость заказа' }),
    syncPartyOrderCalendarAfterCrud({ tenantId: context.tenantId, orderId, previousOrder: order }),
    syncPartyOrderInventory({ tenantId: context.tenantId, order: saved, staffId: context.staff?._id }),
  ])
  const warnings = []
  if (audit.status === 'rejected' || audit.value === null) warnings.push('Стоимость сохранена, но запись истории не подтверждена. Сообщите администратору.')
  if (calendar.status === 'rejected' || ['failed', 'hook_failed'].includes(calendar.value?.status)) warnings.push('Стоимость сохранена, но календарь не удалось обновить. Сообщите администратору.')
  if (inventory.status === 'rejected' || inventory.value?.warning || inventory.value?.hasShortage) warnings.push('Стоимость сохранена. Администратору нужно проверить резерв реквизита.')
  return { ...serializePartyOrderPricing(saved), warnings }
}
