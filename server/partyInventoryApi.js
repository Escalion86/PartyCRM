import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from './partyApi'
import {
  canPartyInventoryAccess,
  collectPartyInventoryOrderIds,
  filterPartyInventoryData,
} from '@helpers/partyInventoryAccess'
import { getPartyOrderModel } from './partyModels'

export const inventoryResponse = (data, status = 200) =>
  NextResponse.json({ success: true, data }, { status })

export const filterPartyInventoryResult = async (
  context,
  data,
  resource = 'inventory.catalog'
) => {
  const ids = collectPartyInventoryOrderIds(data)
  const Orders = ids.length ? await getPartyOrderModel() : null
  const orders = Orders
    ? await Orders.find({
        tenantId: context.tenantId,
        _id: { $in: ids },
      }).lean()
    : []
  return filterPartyInventoryData({ context, data, orders, resource })
}

export const inventoryRoute =
  (handler, permission = { resource: 'inventory.catalog', action: 'read' }) =>
  async (req, params) => {
    const { context, error } = await getPartyRequestContext({
      req,
      allowLocationOwner: true,
      permissionAware: true,
    })
    if (error) return error
    const policy =
      typeof permission === 'string'
        ? {
            resource: permission,
            action: req.method === 'GET' ? 'read' : 'edit',
          }
        : permission
    if (!policy || !canPartyInventoryAccess(context, policy))
      return partyError(
        403,
        'partycrm_forbidden',
        'Недостаточно прав для действия',
        'permission'
      )
    try {
      const response = await handler(req, context, params)
      const payload = await response.json()
      const data = await filterPartyInventoryResult(
        context,
        payload.data,
        policy.resource
      )
      return NextResponse.json(
        { ...payload, data },
        { status: response.status }
      )
    } catch (failure) {
      const status =
        failure.status ||
        (failure.name === 'ValidationError' || failure.name === 'CastError'
          ? 400
          : 500)
      return partyError(
        status,
        'partycrm_inventory_error',
        status < 500 || status === 503
          ? !canPartyInventoryAccess(context, {
              resource: 'inventory.stock',
            }) && /На складе доступно\s+\d/.test(failure.message)
            ? 'Недостаточно доступного реквизита для операции'
            : failure.message
          : 'Не удалось выполнить операцию со складом',
        status < 500 ? 'validation' : 'server'
      )
    }
  }
