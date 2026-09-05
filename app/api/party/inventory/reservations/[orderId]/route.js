import { parseJsonBody } from '@server/partyApi'
import { inventoryRoute, inventoryResponse } from '@server/partyInventoryApi'
import { getPartyInventoryReservationModel } from '@server/partyInventoryModels'
import { getPartyOrderModel } from '@server/partyModels'
import {
  reservePartyOrderInventory,
  releasePartyOrderInventory,
} from '@server/partyInventory'
import {
  isInventoryId,
  inventoryValidationError,
} from '@helpers/partyInventory'

const getOrderId = async (params, tenantId) => {
  const { orderId } = await params
  if (!isInventoryId(orderId))
    throw inventoryValidationError('Некорректный заказ')
  const Orders = await getPartyOrderModel()
  if (!(await Orders.exists({ _id: orderId, tenantId })))
    throw inventoryValidationError('Заказ не найден', 404)
  return orderId
}
export const GET = inventoryRoute(async (req, context, { params }) => {
  const orderId = await getOrderId(params, context.tenantId)
  const Reservations = await getPartyInventoryReservationModel()
  return inventoryResponse(
    await Reservations.findOne({ tenantId: context.tenantId, orderId }).lean()
  )
})
export const PUT = inventoryRoute(async (req, context, { params }) => {
  const orderId = await getOrderId(params, context.tenantId)
  const body = await parseJsonBody(req)
  const result = await reservePartyOrderInventory({
    tenantId: context.tenantId,
    orderId,
    serviceItems: body.serviceItems,
    confirmShortage: body.confirmShortage === true,
    staffId: context.staff._id,
  })
  return inventoryResponse(result, result.saved ? 200 : 409)
})
export const DELETE = inventoryRoute(async (req, context, { params }) => {
  const orderId = await getOrderId(params, context.tenantId)
  return inventoryResponse(
    await releasePartyOrderInventory({ tenantId: context.tenantId, orderId })
  )
})
