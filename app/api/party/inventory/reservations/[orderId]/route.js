import { parseJsonBody } from '@server/partyApi'
import { inventoryRoute, inventoryResponse } from '@server/partyInventoryApi'
import { getPartyInventoryReservationModel } from '@server/partyInventoryModels'
import { getPartyOrderModel } from '@server/partyModels'
import { canPartyInventoryAccess } from '@helpers/partyInventoryAccess'
import {
  reservePartyOrderInventory,
  releasePartyOrderInventory,
} from '@server/partyInventory'
import {
  isInventoryId,
  inventoryValidationError,
} from '@helpers/partyInventory'

const getOrderId = async (params, context) => {
  const { orderId } = await params
  if (!isInventoryId(orderId))
    throw inventoryValidationError('Некорректный заказ')
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({
    _id: orderId,
    tenantId: context.tenantId,
  }).lean()
  if (
    !order ||
    !canPartyInventoryAccess(context, {
      resource: 'inventory.reservations',
      order,
    })
  )
    throw inventoryValidationError('Заказ не найден', 404)
  return orderId
}
export const GET = inventoryRoute(
  async (req, context, { params }) => {
    const orderId = await getOrderId(params, context)
    const Reservations = await getPartyInventoryReservationModel()
    return inventoryResponse(
      await Reservations.findOne({ tenantId: context.tenantId, orderId }).lean()
    )
  },
  { resource: 'inventory.reservations', action: 'read' }
)
export const PUT = inventoryRoute(
  async (req, context, { params }) => {
    const orderId = await getOrderId(params, context)
    const body = await parseJsonBody(req)
    const result = await reservePartyOrderInventory({
      tenantId: context.tenantId,
      orderId,
      serviceItems: body.serviceItems,
      confirmShortage: body.confirmShortage === true,
      staffId: context.staff._id,
      context,
    })
    return inventoryResponse(result, result.saved ? 200 : 409)
  },
  { resource: 'inventory.reservations', action: 'edit' }
)
export const DELETE = inventoryRoute(
  async (req, context, { params }) => {
    const orderId = await getOrderId(params, context)
    return inventoryResponse(
      await releasePartyOrderInventory({
        tenantId: context.tenantId,
        orderId,
        context,
      })
    )
  },
  { resource: 'inventory.reservations', action: 'edit' }
)
