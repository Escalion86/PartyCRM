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
  })
})
export const POST = inventoryRoute(async (req, context) => {
  const payload = normalizeInventoryItem(await parseJsonBody(req))
  const Items = await getPartyInventoryItemModel()
  return inventoryResponse(
    await Items.create({ ...payload, tenantId: context.tenantId }),
    201
  )
})
