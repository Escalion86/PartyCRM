import { parseJsonBody } from '@server/partyApi'
import { inventoryRoute, inventoryResponse } from '@server/partyInventoryApi'
import {
  getPartyInventoryItemModel,
  getPartyInventoryRequirementModel,
} from '@server/partyInventoryModels'
import { getPartyServiceModel } from '@server/partyModels'
import { withPartyInventoryTransaction } from '@server/partyInventory'
import {
  isInventoryId,
  normalizeInventoryRequirements,
  assertInventoryReferences,
  inventoryValidationError,
} from '@helpers/partyInventory'

export const PUT = inventoryRoute(async (req, context, { params }) => {
  const { serviceId } = await params
  if (!isInventoryId(serviceId))
    throw inventoryValidationError('Некорректная услуга')
  const items = normalizeInventoryRequirements((await parseJsonBody(req)).items)
  const [Items, Requirements, Services] = await Promise.all([
    getPartyInventoryItemModel(),
    getPartyInventoryRequirementModel(),
    getPartyServiceModel(),
  ])
  await Requirements.init()
  const data = await withPartyInventoryTransaction(
    context.tenantId,
    async (session) => {
      const services = await Services.find({
        _id: serviceId,
        tenantId: context.tenantId,
      })
        .session(session)
        .lean()
      assertInventoryReferences([serviceId], services, context.tenantId)
      const resources = await Items.find({
        tenantId: context.tenantId,
        _id: { $in: items.map((item) => item.resourceId) },
        status: 'active',
      })
        .session(session)
        .lean()
      assertInventoryReferences(
        items.map((item) => item.resourceId),
        resources,
        context.tenantId
      )
      return Requirements.findOneAndUpdate(
        { tenantId: context.tenantId, serviceId },
        { $set: { items } },
        { upsert: true, new: true, runValidators: true, session }
      ).lean()
    }
  )
  return inventoryResponse(data)
})
