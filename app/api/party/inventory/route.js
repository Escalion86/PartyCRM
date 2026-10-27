import { parseJsonBody } from '@server/partyApi'
import { inventoryRoute, inventoryResponse } from '@server/partyInventoryApi'
import {
  getPartyInventoryItemModel,
  getPartyInventoryRequirementModel,
  getPartyInventoryHoldingModel,
} from '@server/partyInventoryModels'
import { inventoryPhysicalStock } from '@helpers/partyInventoryMovements'
import { inventoryId } from '@helpers/partyInventory'
import { normalizeInventoryItem } from '@helpers/partyInventory'
import { canPartyInventoryAccess } from '@helpers/partyInventoryAccess'
import { inventoryValidationError } from '@helpers/partyInventory'

export const dynamic = 'force-dynamic'
export const GET = inventoryRoute(async (req, context) => {
  const [Items, Requirements] = await Promise.all([
    getPartyInventoryItemModel(),
    getPartyInventoryRequirementModel(),
  ])
  const [items, requirements] = await Promise.all([
    Items.find({ tenantId: context.tenantId })
      .sort({ status: 1, title: 1 })
      .lean(),
    Requirements.find({ tenantId: context.tenantId }).lean(),
  ])
  const Holdings = await getPartyInventoryHoldingModel()
  const holdings = await Holdings.find({
    tenantId: context.tenantId,
    quantity: { $gt: 0 },
  }).lean()
  return inventoryResponse({
    items: items.map((item) => ({
      ...item,
      ...inventoryPhysicalStock(
        item,
        holdings.filter(
          (holding) => inventoryId(holding.resourceId) === inventoryId(item)
        )
      ),
    })),
    requirements,
    permissions: {
      reservations: canPartyInventoryAccess(context, {
        resource: 'inventory.reservations',
      }),
      editReservations: canPartyInventoryAccess(context, {
        resource: 'inventory.reservations',
        action: 'edit',
      }),
      stock: canPartyInventoryAccess(context, { resource: 'inventory.stock' }),
      movements: canPartyInventoryAccess(context, {
        resource: 'inventory.movements',
      }),
      editMovements: canPartyInventoryAccess(context, {
        resource: 'inventory.movements',
        action: 'edit',
      }),
    },
  })
})
export const POST = inventoryRoute(
  async (req, context) => {
    const body = await parseJsonBody(req)
    const payload = normalizeInventoryItem({ quantity: 0, ...body })
    if (
      !canPartyInventoryAccess(context, {
        resource: 'inventory.stock',
        action: 'edit',
      }) &&
      (payload.quantity ||
        payload.unavailableQuantity ||
        payload.unavailableReason ||
        payload.storageLocation)
    )
      throw inventoryValidationError(
        'Нет права задавать остатки и складские сведения',
        403
      )
    const Items = await getPartyInventoryItemModel()
    return inventoryResponse(
      await Items.create({ ...payload, tenantId: context.tenantId }),
      201
    )
  },
  { resource: 'inventory.catalog', action: 'edit' }
)
