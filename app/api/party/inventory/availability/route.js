import { parseJsonBody } from '@server/partyApi'
import { inventoryRoute, inventoryResponse } from '@server/partyInventoryApi'
import { preparePartyInventory } from '@server/partyInventory'
import { getPartyOrderModel } from '@server/partyModels'
import {
  isInventoryId,
  inventoryValidationError,
} from '@helpers/partyInventory'

export const POST = inventoryRoute(async (req, context) => {
  const body = await parseJsonBody(req)
  if (body.orderId) {
    if (!isInventoryId(body.orderId))
      throw inventoryValidationError('Некорректный заказ')
    const Orders = await getPartyOrderModel()
    if (
      !(await Orders.exists({ _id: body.orderId, tenantId: context.tenantId }))
    )
      throw inventoryValidationError('Заказ не найден', 404)
  }
  return inventoryResponse(
    await preparePartyInventory({
      tenantId: context.tenantId,
      serviceItems: body.serviceItems,
      eventDate: body.eventDate,
      dateEnd: body.dateEnd,
      orderId: body.orderId || '',
    })
  )
})
