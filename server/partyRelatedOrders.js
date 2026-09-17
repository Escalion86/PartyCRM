import { getPartyEventGroupModel } from './partyEventGroupModels'
import { getPartyOrderModel, getPartyTransactionModel, getPartyClientModel, getPartyLocationModel } from './partyModels'
import { withPartyFinancialTransaction } from './partyFinancialSettlements'
import { buildPartyRelatedOrdersSummary } from '@helpers/partyRelatedOrders'

const fail = (message, status = 409) => {
  const error = new Error(message)
  error.status = status
  error.code = 'partycrm_related_orders_error'
  throw error
}
const revision = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail('Передайте актуальную версию группы', 400)
}
const checkWrite = (result) => {
  if (result.matchedCount !== 1) fail('Связи заказов изменились. Обновите страницу')
}
const groupFilter = (order) => order.partyEventGroupId || null

const activeLocationOrder = (order) => ['draft', 'active'].includes(order.status) &&
  order.placeType === 'company_location' && Boolean(order.locationId)
const locationOverlaps = (left, right) => activeLocationOrder(left) && activeLocationOrder(right) &&
  String(left.locationId) === String(right.locationId) &&
  new Date(left.eventDate).getTime() < new Date(right.dateEnd).getTime() &&
  new Date(left.dateEnd).getTime() > new Date(right.eventDate).getTime()
const assertNoLocationOverlaps = (orders, departingId = null) => {
  for (let index = 0; index < orders.length; index++) {
    for (const other of orders.slice(index + 1)) {
      const order = orders[index]
      if (departingId && String(order._id) !== String(departingId) && String(other._id) !== String(departingId)) continue
      if (locationOverlaps(order, other)) fail('Заказы пересекаются на одной площадке. Сначала измените площадку или время либо отмените одну из частей праздника')
    }
  }
}
const touchMembers = async (Orders, tenantId, groupId, members, session, sharedLocationBooking) => {
  for (const order of members) checkWrite(await Orders.updateOne(
    { _id: order._id, tenantId, partyEventGroupId: groupId },
    { $set: { updatedAt: new Date(), ...(typeof sharedLocationBooking === 'boolean' ? { sharedLocationBooking } : {}) }, $inc: { sharedLocationRevision: 1 } }, { session }
  ))
}

export const getPartySharedLocationOrderIds = async ({ tenantId, orderId }) => {
  if (!orderId) return []
  const Orders = await getPartyOrderModel()
  const current = await Orders.findOne({ _id: orderId, tenantId }).select('_id partyEventGroupId').lean()
  if (!current?.partyEventGroupId) return []
  const Groups = await getPartyEventGroupModel()
  const group = await Groups.findOne({ _id: current.partyEventGroupId, tenantId, sharedLocationBooking: true }).select('_id').lean()
  if (!group) return []
  return (await Orders.find({ tenantId, partyEventGroupId: group._id, placeType: 'company_location' }).select('_id').lean()).map((order) => String(order._id))
}

export const updatePartySharedLocationBooking = async ({ tenantId, orderId, sharedLocationBooking, expectedRevision }) => {
  revision(expectedRevision)
  if (typeof sharedLocationBooking !== 'boolean') fail('Укажите режим общей брони площадки', 400)
  const [Orders, Groups] = await Promise.all([getPartyOrderModel(), getPartyEventGroupModel()])
  return withPartyFinancialTransaction(tenantId, async (session) => {
    const current = await Orders.findOne({ _id: orderId, tenantId }).session(session).lean()
    if (!current) fail('Заказ не найден', 404)
    const groupId = current.partyEventGroupId
    if (!groupId) fail('Заказ не входит в группу')
    const members = await Orders.find({ tenantId, partyEventGroupId: groupId }).session(session).lean()
    if (!sharedLocationBooking) assertNoLocationOverlaps(members)
    checkWrite(await Groups.updateOne({ _id: groupId, tenantId, revision: expectedRevision }, { $set: { sharedLocationBooking }, $inc: { revision: 1 } }, { session }))
    await touchMembers(Orders, tenantId, groupId, members, session, sharedLocationBooking)
    return { groupId: String(groupId), sharedLocationBooking, revision: expectedRevision + 1 }
  })
}

export const getPartyRelatedOrders = async ({ tenantId, orderId, search = '' }) => {
  const Orders = await getPartyOrderModel()
  const current = await Orders.findOne({ _id: orderId, tenantId }).lean()
  if (!current) fail('Заказ не найден', 404)
  const filter = { tenantId, _id: { $ne: current._id }, partyEventGroupId: null, status: { $ne: 'canceled' } }
  const text = String(search).trim().slice(0, 180)
  if (text) filter.title = { $regex: text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  const candidates = await Orders.find(filter).select('_id title eventDate status').sort({ eventDate: -1, _id: -1 }).limit(50).lean()
  if (!current.partyEventGroupId) return { group: null, candidates }
  const Groups = await getPartyEventGroupModel()
  const group = await Groups.findOne({ _id: current.partyEventGroupId, tenantId }).lean()
  if (!group) fail('Группа заказов не найдена. Обратитесь к администратору', 409)
  const orders = await Orders.find({ tenantId, partyEventGroupId: group._id }).sort({ eventDate: 1, _id: 1 }).lean()
  const [Transactions, Clients, Locations] = await Promise.all([getPartyTransactionModel(), getPartyClientModel(), getPartyLocationModel()])
  const clientIds = orders.flatMap((order) => [order.contactRoles?.payerClientId, order.clientId]).filter(Boolean)
  const locationIds = orders.map((order) => order.locationId).filter(Boolean)
  const [transactions, clients, locations] = await Promise.all([
    Transactions.find({ tenantId, orderId: { $in: orders.map((order) => order._id) } }).lean(),
    Clients.find({ tenantId, _id: { $in: clientIds } }).select('_id tenantId firstName secondName thirdName').lean(),
    Locations.find({ tenantId, _id: { $in: locationIds } }).select('_id tenantId title').lean(),
  ])
  return { group: { id: String(group._id), title: group.title, revision: group.revision, sharedLocationBooking: group.sharedLocationBooking === true, ...buildPartyRelatedOrdersSummary({ orders, transactions, clients, locations }) }, candidates }
}

export const linkPartyRelatedOrder = async ({ tenantId, orderId, targetOrderId, title, expectedRevision }) => {
  revision(expectedRevision)
  if (String(orderId) === String(targetOrderId)) fail('Нельзя связать заказ с самим собой', 400)
  if (title !== undefined && (typeof title !== 'string' || title.trim().length > 180)) fail('Название группы: не более 180 символов', 400)
  const [Orders, Groups] = await Promise.all([getPartyOrderModel(), getPartyEventGroupModel()])
  await Groups.init()
  return withPartyFinancialTransaction(tenantId, async (session) => {
    const current = await Orders.findOne({ _id: orderId, tenantId }).session(session).lean()
    const target = await Orders.findOne({ _id: targetOrderId, tenantId }).session(session).lean()
    if (!current || !target) fail('Заказ не найден', 404)
    if (current.status === 'canceled' || target.status === 'canceled') fail('Нельзя добавлять отменённый заказ в группу', 400)
    if (target.partyEventGroupId) fail('Выбранный заказ уже связан с другим праздником')
    let groupId = current.partyEventGroupId
    let sharedLocationBooking = false
    let otherMembers = []
    if (!groupId) {
      if (expectedRevision !== 0) fail('Связи заказов изменились. Обновите страницу')
      const [group] = await Groups.create([{ tenantId, title: title?.trim() || current.title?.slice(0, 180) || 'Общий праздник', revision: 1 }], { session })
      groupId = group._id
    } else {
      const group = await Groups.findOne({ _id: groupId, tenantId }).session(session).lean()
      if (!group) fail('Группа заказов не найдена')
      sharedLocationBooking = group.sharedLocationBooking === true
      otherMembers = await Orders.find({ tenantId, partyEventGroupId: groupId }).session(session).lean()
      const members = await Orders.countDocuments({ tenantId, partyEventGroupId: groupId }).session(session)
      if (members >= 20) fail('В группе может быть не более 20 заказов', 400)
      checkWrite(await Groups.updateOne({ _id: groupId, tenantId, revision: expectedRevision }, { $inc: { revision: 1 } }, { session }))
    }
    // Both orders are written to make concurrent deletion/relinking conflict with this transaction.
    for (const order of [current, target]) {
      checkWrite(await Orders.updateOne({ _id: order._id, tenantId, partyEventGroupId: groupFilter(order) }, { $set: { partyEventGroupId: groupId, sharedLocationBooking, updatedAt: new Date() }, $inc: { sharedLocationRevision: 1 } }, { session }))
    }
    await touchMembers(Orders, tenantId, groupId, otherMembers.filter((order) => String(order._id) !== String(current._id)), session, sharedLocationBooking)
    return { groupId: String(groupId) }
  })
}

export const unlinkPartyRelatedOrder = async ({ tenantId, orderId, expectedRevision }) => {
  revision(expectedRevision)
  const [Orders, Groups] = await Promise.all([getPartyOrderModel(), getPartyEventGroupModel()])
  return withPartyFinancialTransaction(tenantId, async (session) => {
    const current = await Orders.findOne({ _id: orderId, tenantId }).session(session).lean()
    if (!current) fail('Заказ не найден', 404)
    const groupId = current.partyEventGroupId
    if (!groupId) fail('Заказ уже не входит в группу')
    const members = await Orders.find({ tenantId, partyEventGroupId: groupId }).session(session).lean()
    assertNoLocationOverlaps(members, current._id)
    checkWrite(await Groups.updateOne({ _id: groupId, tenantId, revision: expectedRevision }, { $inc: { revision: 1 } }, { session }))
    await touchMembers(Orders, tenantId, groupId, members.filter((order) => String(order._id) !== String(current._id)), session)
    checkWrite(await Orders.updateOne({ _id: current._id, tenantId, partyEventGroupId: groupId }, { $set: { partyEventGroupId: null, sharedLocationBooking: false, updatedAt: new Date() }, $inc: { sharedLocationRevision: 1 } }, { session }))
    const remaining = await Orders.find({ tenantId, partyEventGroupId: groupId }).session(session).lean()
    if (remaining.length <= 1) {
      if (remaining.length) checkWrite(await Orders.updateOne({ _id: remaining[0]._id, tenantId, partyEventGroupId: groupId }, { $set: { partyEventGroupId: null, sharedLocationBooking: false, updatedAt: new Date() }, $inc: { sharedLocationRevision: 1 } }, { session }))
      await Groups.deleteOne({ _id: groupId, tenantId, revision: expectedRevision + 1 }, { session })
    }
    return { groupId: null }
  })
}
