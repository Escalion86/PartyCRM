import { PARTY_ORDER_SORT_OPTIONS } from './partyOrderBooking.js'
import { canPartyAccess } from './partyRolePermissions.js'

const invalid = () => {
  throw Object.assign(
    new Error('Проверьте сортировку и курсор списка заказов.'),
    { status: 400, code: 'partycrm_invalid_order_list_query' }
  )
}
export const parsePartyOrderSorting = (params, context) => {
  const sortBy = params.get('sortBy') || 'created_desc'
  const option = PARTY_ORDER_SORT_OPTIONS.find((item) => item.value === sortBy)
  if (!option || params.getAll('sortBy').length > 1) invalid()
  if (
    option.resource &&
    !canPartyAccess(context, { resource: option.resource })
  )
    throw Object.assign(new Error('Нет доступа к выбранной сортировке.'), {
      status: 403,
      code: 'partycrm_order_list_sort_forbidden',
    })
  const scope = JSON.stringify(
    ['q', 'stageId', 'quick', 'todayFrom', 'todayTo'].map(
      (key) => params.get(key) || ''
    )
  )
  const raw = params.get('listCursor') || ''
  if (!raw) return { sortBy, scope, point: null }
  if (/^[a-f\d]{24}$/i.test(raw) && sortBy === 'created_desc')
    return { sortBy, scope, point: { legacy: true, id: raw.toLowerCase() } }
  if (raw.length > 2000) invalid()
  let point
  try {
    point = JSON.parse(decodeURIComponent(raw))
  } catch {
    invalid()
  }
  if (
    point.v !== 1 ||
    point.sortBy !== sortBy ||
    point.scope !== scope ||
    !/^[a-f\d]{24}$/i.test(point.id) ||
    ![0, 1].includes(point.undated)
  )
    invalid()
  if (
    sortBy.startsWith('amount_')
      ? !Number.isFinite(point.value) || point.value < 0
      : point.value !== null &&
        (typeof point.value !== 'string' ||
          !Number.isFinite(Date.parse(point.value)))
  )
    invalid()
  return { sortBy, scope, point }
}
export const partyOrderSortSpec = (sorting) => ({
  ...(sorting.sortBy.startsWith('event_') ? { _partyUndated: 1 } : {}),
  _partySortValue: sorting.sortBy.endsWith('_asc') ? 1 : -1,
  _id: sorting.sortBy.endsWith('_asc') ? 1 : -1,
})
export const partyOrderSortFields = (sorting) => ({
  _partySortValue: sorting.sortBy.startsWith('event_')
    ? { $ifNull: ['$eventDate', null] }
    : sorting.sortBy.startsWith('amount_')
      ? {
          $ifNull: [
            '$contractAmount',
            { $ifNull: ['$clientPayment.totalAmount', 0] },
          ],
        }
      : { $ifNull: ['$createdAt', { $toDate: '$_id' }] },
  _partyUndated: {
    $cond: [{ $eq: [{ $ifNull: ['$eventDate', null] }, null] }, 1, 0],
  },
})
export const partyOrderCursorClause = (sorting, cursor) => {
  if (!cursor) return null
  const point =
    typeof cursor === 'object' ? cursor : JSON.parse(decodeURIComponent(cursor))
  if (point.legacy) return { _id: { $lt: point.id } }
  const compare = sorting.sortBy.endsWith('_asc') ? '$gt' : '$lt'
  const value =
    sorting.sortBy.startsWith('amount_') || point.value == null
      ? point.value
      : new Date(point.value)
  const after = {
    $or: [
      { _partySortValue: { [compare]: value } },
      { _partySortValue: value, _id: { [compare]: point.id } },
    ],
  }
  return sorting.sortBy.startsWith('event_')
    ? {
        $or: [
          { _partyUndated: { $gt: point.undated } },
          { _partyUndated: point.undated, ...after },
        ],
      }
    : after
}
export const encodePartyOrderCursor = (sorting, order) => {
  const raw =
    order._partySortValue ??
    (sorting.sortBy.startsWith('event_')
      ? order.eventDate
      : sorting.sortBy.startsWith('amount_')
        ? (order.contractAmount ?? order.clientPayment?.totalAmount ?? 0)
        : order.createdAt ||
          new Date(parseInt(String(order._id).slice(0, 8), 16) * 1000))
  return encodeURIComponent(
    JSON.stringify({
      v: 1,
      sortBy: sorting.sortBy,
      scope: sorting.scope,
      id: String(order._id),
      undated: sorting.sortBy.startsWith('event_') && !order.eventDate ? 1 : 0,
      value: sorting.sortBy.startsWith('amount_')
        ? Number(raw)
        : raw
          ? new Date(raw).toISOString()
          : null,
    })
  )
}
