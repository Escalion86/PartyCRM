import { parseJsonBody } from '@server/partyApi'
import { inventoryRoute, inventoryResponse } from '@server/partyInventoryApi'
import {
  getPartyInventoryItemModel,
  getPartyInventoryHoldingModel,
} from '@server/partyInventoryModels'
import { validateInventoryStockEdit } from '@helpers/partyInventoryMovements'
import { canPartyInventoryAccess } from '@helpers/partyInventoryAccess'
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
  if (
    !canPartyInventoryAccess(context, {
      resource: 'inventory.catalog',
      action: 'edit',
    }) &&
    !canPartyInventoryAccess(context, {
      resource: 'inventory.stock',
      action: 'edit',
    })
  )
    throw inventoryValidationError('Нет права изменять реквизит', 403)
  if (!isInventoryId(id))
    throw inventoryValidationError('Некорректный реквизит')
  const body = await parseJsonBody(req)
  const allowedFields = [
    'title',
    'category',
    'unit',
    'status',
    'storageLocation',
    'unavailableReason',
    'quantity',
    'unavailableQuantity',
  ]
  if (!body || Object.keys(body).some((key) => !allowedFields.includes(key)))
    throw inventoryValidationError('Передайте только изменённые поля реквизита')
  const Items = await getPartyInventoryItemModel()
  const item = await withPartyInventoryTransaction(
    context.tenantId,
    async (session) => {
      const current = await Items.findOne({
        _id: id,
        tenantId: context.tenantId,
      })
        .session(session)
        .lean()
      if (!current) throw inventoryValidationError('Реквизит не найден', 404)
      const stockFields = [
        'quantity',
        'unavailableQuantity',
        'storageLocation',
        'unavailableReason',
      ]
      for (const key of Object.keys(body)) {
        const resource = stockFields.includes(key)
          ? 'inventory.stock'
          : 'inventory.catalog'
        if (
          JSON.stringify(body[key]) !== JSON.stringify(current[key]) &&
          !canPartyInventoryAccess(context, { resource, action: 'edit' })
        )
          throw inventoryValidationError(
            'Нет права изменять выбранные поля реквизита',
            403
          )
      }
      const payload = normalizeInventoryItem({ ...current, ...body })
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
