import { parseJsonBody } from '@server/partyApi'
import { inventoryResponse, inventoryRoute } from '@server/partyInventoryApi'
import {
  getPartyInventoryHoldingModel,
  getPartyInventoryMovementModel,
  getPartyInventoryItemModel,
} from '@server/partyInventoryModels'
import { getPartyOrderModel, getPartyStaffModel } from '@server/partyModels'
import {
  inventoryId,
  isInventoryId,
  inventoryValidationError,
} from '@helpers/partyInventory'
import { inventoryPhysicalStock } from '@helpers/partyInventoryMovements'
import {
  performPartyInventoryMovement,
  inventoryStaffName,
} from '@server/partyInventoryMovements'

export const dynamic = 'force-dynamic'
export const POST = inventoryRoute(async (req, context) =>
  inventoryResponse(
    await performPartyInventoryMovement({
      tenantId: context.tenantId,
      actorStaffId: context.staff._id,
      body: await parseJsonBody(req),
    })
  )
)
export const GET = inventoryRoute(async (req, context) => {
  const orderId = req.nextUrl.searchParams.get('orderId') || ''
  const cursor = req.nextUrl.searchParams.get('cursor') || ''
  if (
    (orderId && !isInventoryId(orderId)) ||
    (cursor && !isInventoryId(cursor))
  )
    throw inventoryValidationError('Некорректный заказ или страница журнала')
  const [Holdings, Movements, Staff, Orders, Items] = await Promise.all([
    getPartyInventoryHoldingModel(),
    getPartyInventoryMovementModel(),
    getPartyStaffModel(),
    getPartyOrderModel(),
    getPartyInventoryItemModel(),
  ])
  const filter = { tenantId: context.tenantId }
  if (orderId && !await Orders.exists({ ...filter, _id: orderId }) && !await Holdings.exists({ ...filter, orderId, quantity: { $gt: 0 } })) throw inventoryValidationError('Заказ не найден', 404)
  const [allHoldings, movements, items] = await Promise.all([
    Holdings.find({ ...filter, quantity: { $gt: 0 } }).lean(),
    Movements.find({
      ...filter,
      ...(orderId ? { orderId } : {}),
      ...(cursor ? { _id: { $lt: cursor } } : {}),
    })
      .sort({ _id: -1 })
      .limit(51)
      .select('-payloadHash -idempotencyKey')
      .lean(),
    Items.find(filter).sort({ title: 1 }).lean(),
  ])
  const holdings = allHoldings.filter(
    (holding) => !orderId || inventoryId(holding.orderId) === orderId
  )
  const [staff, orders] = await Promise.all([
    Staff.find({
      ...filter,
      $or: [
        { status: 'active' },
        { _id: { $in: holdings.map((holding) => holding.holderStaffId) } },
      ],
    })
      .select('_id firstName secondName status')
      .lean(),
    Orders.find({
      ...filter,
      ...(orderId
        ? { _id: orderId }
        : {
            $or: [
              { status: { $in: ['draft', 'active'] } },
              { _id: { $in: holdings.map((holding) => holding.orderId) } },
            ],
          }),
    })
      .sort({ eventDate: -1 })
      .limit(300)
      .select('_id title serviceTitle eventDate status')
      .lean(),
  ])
  const staffNames = new Map(
    staff.map((person) => [inventoryId(person), inventoryStaffName(person)])
  )
  const orderNames = new Map(
    orders.map((order) => [
      inventoryId(order),
      order.title || order.serviceTitle || 'Заказ',
    ])
  )
  return inventoryResponse({
    items: items.map((item) => ({
      ...item,
      ...inventoryPhysicalStock(
        item,
        allHoldings.filter(
          (holding) => inventoryId(holding.resourceId) === inventoryId(item)
        )
      ),
    })),
    holdings: holdings.map((holding) => ({
      ...holding,
      holderName:
        staffNames.get(inventoryId(holding.holderStaffId)) || 'Сотрудник',
      orderTitle:
        orderNames.get(inventoryId(holding.orderId)) || 'Удалённый заказ',
    })),
    staff: staff.map((person) => ({
      ...person,
      title: inventoryStaffName(person),
    })),
    orders,
    movements: movements.slice(0, 50),
    nextCursor: movements.length > 50 ? inventoryId(movements[49]) : null,
  })
})
