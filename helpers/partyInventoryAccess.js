import {
  canPartyAccess,
  filterPartyOrderForAccess,
} from './partyRolePermissions.js'
import { canPartyOperationalPermission } from './partyOperationalPermissions.js'

export const isPartyInventoryLegacyOperator = (context) =>
  (!context?.position || (context.position.systemKey === context.role && !Number(context.position.revision || 0) &&
    context.position.active !== false && String(context.position.tenantId) === String(context.tenantId))) &&
  !context?.staff?.positionId &&
  canPartyOperationalPermission(context, 'inventory.movements')

export const canPartyInventoryAccess = (
  context,
  { resource = 'inventory.catalog', action = 'read', order } = {}
) => {
  const legacy =
    resource === 'inventory.movements' &&
    isPartyInventoryLegacyOperator(context)
  if (
    (!canPartyAccess(context, { resource: 'inventory' }) && !legacy) ||
    (!canPartyAccess(context, { resource, action }) && !legacy)
  )
    return false
  return !order || canPartyAccess(context, { resource: 'orders', order })
}

export const hasUnrestrictedPartyInventoryScope = (context) =>
  canPartyAccess(context, { resource: 'orders' }) &&
  (context?.role === 'owner' ||
    (context?.role === 'admin' &&
      !context?.position &&
      !context?.staff?.positionId))

const idOf = (value) => String(value?._id ?? value ?? '')
const list = (value) => (Array.isArray(value) ? value : [])
const pick = (value, fields) =>
  Object.fromEntries(
    fields
      .filter((key) => value?.[key] !== undefined)
      .map((key) => [key, value[key]])
  )
const catalogFields = ['_id', 'title', 'category', 'unit', 'status']
const stockFields = [
  'quantity',
  'unavailableQuantity',
  'unavailableReason',
  'storageLocation',
  'heldQuantity',
  'physicalQuantity',
  'freeQuantity',
]
const withoutPrivateCounts = (rows) => {
  let unavailable = false
  return rows.filter((row) => {
    if (!row.unavailableOrder) return true
    if (unavailable) return false
    unavailable = true
    return true
  })
}

export const collectPartyInventoryOrderIds = (data) => {
  const result = new Set()
  const collect = (value, key) => {
    if (Array.isArray(value)) {
      value.forEach((item) => collect(item, key))
      return
    }
    if (!value || typeof value !== 'object') return
    if (value.orderId) result.add(idOf(value.orderId))
    if (key === 'orders' && value._id) result.add(idOf(value._id))
    Object.entries(value).forEach(([childKey, child]) =>
      collect(child, childKey)
    )
  }
  collect(data, '')
  return [...result]
}

// Whitelisting applies to every inventory response, including nested saved
// reservations and shortage results returned with HTTP 409.
export const filterPartyInventoryData = ({
  context,
  data,
  orders = [],
  resource = 'inventory.catalog',
}) => {
  const canStock = canPartyInventoryAccess(context, {
    resource: 'inventory.stock',
  })
  const canCatalog = canPartyInventoryAccess(context, {
    resource: 'inventory.catalog',
  })
  const canMovements = canPartyInventoryAccess(context, {
    resource: 'inventory.movements',
  })
  const byId = new Map(orders.map((order) => [idOf(order), order]))
  const readableOrder = (orderId) => {
    const order = byId.get(idOf(orderId))
    return order
      ? canPartyAccess(context, { resource: 'orders', order })
      : hasUnrestrictedPartyInventoryScope(context)
  }
  const orderTitle = (orderId) => {
    const order = byId.get(idOf(orderId))
    if (!order) return 'Удалённый заказ'
    if (canPartyAccess(context, { resource: 'orders.title', order }))
      return order.title || 'Заказ'
    if (canPartyAccess(context, { resource: 'orders.serviceTitle', order }))
      return order.serviceTitle || 'Заказ'
    return 'Заказ'
  }
  const item = (value) =>
    pick(value, [...catalogFields, ...(canStock ? stockFields : [])])
  const conflict = (value) => {
    if (!readableOrder(value.orderId))
      return {
        unavailableOrder: true,
        orderTitle: 'Занято недоступным заказом',
      }
    const order = byId.get(idOf(value.orderId))
    return {
      orderId: value.orderId,
      orderTitle: orderTitle(value.orderId),
      ...(canStock && value.quantity !== undefined
        ? { quantity: value.quantity }
        : {}),
      ...(order &&
      canPartyAccess(context, { resource: 'orders.servicesIds', order })
        ? pick(value, ['serviceId', 'serviceLineId'])
        : {}),
    }
  }
  const warning = (value) => ({
    ...pick(value, [
      'resourceId',
      'startAt',
      'endAt',
      'serviceLineIds',
      'needed',
    ]),
    title: canCatalog ? value.title : 'Реквизит',
    ...(canStock
      ? pick(value, [
          'quantity',
          'unavailableQuantity',
          'availableQuantity',
          'occupied',
          'heldQuantity',
          'shortage',
        ])
      : {}),
    conflicts: withoutPrivateCounts(list(value.conflicts).map(conflict)),
    holders: canStock
      ? withoutPrivateCounts(
          list(value.holders).map((holder) =>
            readableOrder(holder.orderId)
              ? {
                  ...pick(holder, [
                    'holderStaffId',
                    'holderName',
                    'orderId',
                    'quantity',
                    'expectedReturnAt',
                  ]),
                  orderTitle: orderTitle(holder.orderId),
                }
              : {
                  unavailableOrder: true,
                  orderTitle: 'Занято недоступным заказом',
                }
          )
        )
      : [],
  })
  const visit = (value, key = '') => {
    if (Array.isArray(value)) {
      if (key === 'staff')
        return canPartyInventoryAccess(context, {
          resource: 'inventory.movements',
          action: 'edit',
        })
          ? value.map((person) =>
              pick(person, ['_id', 'firstName', 'secondName', 'title', 'status'])
            )
          : []
      if (key === 'orders')
        return value
          .filter((order) => readableOrder(order._id))
          .map((order) => {
            const full = byId.get(idOf(order)) || order
            return pick(filterPartyOrderForAccess(context, full), [
              '_id',
              'title',
              'serviceTitle',
              'eventDate',
              'status',
            ])
          })
      if (key === 'holdings')
        return canMovements && resource === 'inventory.movements'
          ? value
              .filter((holding) => readableOrder(holding.orderId))
              .map((holding) => ({
                ...holding,
                orderTitle: orderTitle(holding.orderId),
              }))
          : []
      if (key === 'movements')
        return value
          .filter((movement) => readableOrder(movement.orderId))
          .map((movement) => ({
            ...movement,
            orderTitle: orderTitle(movement.orderId),
          }))
      if (key === 'holdingRisks')
        return canStock
          ? withoutPrivateCounts(
              value.map((holding) =>
                readableOrder(holding.orderId)
                  ? {
                      ...pick(holding, [
                        'resourceId',
                        'title',
                        'holderStaffId',
                        'holderName',
                        'orderId',
                        'quantity',
                        'expectedReturnAt',
                      ]),
                      orderTitle: orderTitle(holding.orderId),
                    }
                  : {
                      unavailableOrder: true,
                      orderTitle: 'Занято недоступным заказом',
                    }
              )
            )
          : []
      if (key === 'warnings') return value.map(warning)
      return value.map((entry) => visit(entry, key))
    }
    if (!value || typeof value !== 'object') return value
    if (value._id && value.title !== undefined && value.unit !== undefined)
      return item(value)
    if (key === 'movement')
      return readableOrder(value.orderId)
        ? { ...value, orderTitle: orderTitle(value.orderId) }
        : null
    const output = Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        visit(child, childKey),
      ])
    )
    if (
      !canCatalog &&
      Array.isArray(output.items) &&
      output.items.some((entry) => entry?._id)
    )
      output.items = []
    return output
  }
  return visit(data)
}
