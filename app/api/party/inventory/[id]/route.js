import { parseJsonBody } from '@server/partyApi'
import { inventoryRoute, inventoryResponse } from '@server/partyInventoryApi'
import {
  getPartyInventoryItemModel,
  getPartyInventoryHoldingModel,
} from '@server/partyInventoryModels'
import { validateInventoryStockEdit } from '@helpers/partyInventoryMovements'
import {
  withPartyInventoryTransaction,
  refreshPartyInventoryResourceWarnings,
} from '@server/partyInventory'
import {
  isInventoryId,
  normalizeInventoryItem,
  inventoryValidationError,
} from '@helpers/partyInventory'

export const PATCH = inventoryRoute(async (req, context, { params }) => {
  const { id } = await params
  if (!isInventoryId(id))
    throw inventoryValidationError('Некорректный реквизит')
  const payload = normalizeInventoryItem(await parseJsonBody(req))
  const Items = await getPartyInventoryItemModel()
  const item = await withPartyInventoryTransaction(
    context.tenantId,
    async (session) => {
      const Holdings = await getPartyInventoryHoldingModel()
      const holdings = await Holdings.find({
        tenantId: context.tenantId,
        resourceId: id,
        quantity: { $gt: 0 },
      })
        .session(session)
        .lean()
      validateInventoryStockEdit(payload, holdings)
      const updated = await Items.findOneAndUpdate(
        { _id: id, tenantId: context.tenantId },
        { $set: payload },
        { new: true, runValidators: true, session }
      ).lean()
      if (updated)
        await refreshPartyInventoryResourceWarnings({
          tenantId: context.tenantId,
          resourceId: id,
          session,
        })
      return updated
    }
  )
  if (!item) throw inventoryValidationError('Реквизит не найден', 404)
  return inventoryResponse(item)
})
