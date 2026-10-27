import { parseJsonBody } from '@server/partyApi'
import { inventoryRoute, inventoryResponse } from '@server/partyInventoryApi'
import { preparePartyInventory } from '@server/partyInventory'
import { getPartyOrderModel } from '@server/partyModels'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { canPartyInventoryAccess } from '@helpers/partyInventoryAccess'
import {
  isInventoryId,
  inventoryValidationError,
} from '@helpers/partyInventory'

export const POST = inventoryRoute(
  async (req, context) => {
    const body = await parseJsonBody(req)
    if (body.orderId) {
      if (!isInventoryId(body.orderId))
        throw inventoryValidationError('Некорректный заказ')
      const Orders = await getPartyOrderModel()
      const order = await Orders.findOne({
        _id: body.orderId,
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
    } else if (
      !canPartyAccess(context, { resource: 'orders', action: 'create' })
    ) {
      throw inventoryValidationError(
        'Выберите доступный заказ для проверки комплекта',
        403
      )
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
  },
  { resource: 'inventory.reservations', action: 'read' }
)
