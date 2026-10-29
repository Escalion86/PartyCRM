import { canPartyAccess } from './partyRolePermissions.js'
import { canPartyInventoryAccess } from './partyInventoryAccess.js'
import { parsePartyOrderCalendarQuery } from './partyOrderCalendarQuery.js'
import { isPartyTicketingEnabled } from './partyTicketing.js'
import { getPartyVenuePeakCapacity, partyVenueWindowsOverlap } from './partyVenueBooking.js'
import { sharePartyLocationBooking } from './partySharedLocationBooking.js'
import { calculateInventoryAvailability } from './partyInventory.js'

export const PARTY_RESOURCE_CALENDAR_RESOURCE_LIMIT = 100
export const PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT = 600
export const PARTY_RESOURCE_CALENDAR_MAX_RANGE_MS = 8 * 86400000
export const PARTY_RESOURCE_CALENDAR_NOTICE = 'Показаны только доступные вам записи. Отсутствие записи не подтверждает свободное время: окончательная проверка выполняется при сохранении заказа или сеанса. Резервы реквизита не заменяют проверку фактической выдачи и возврата на складе.'

export const partyResourceCalendarFailure = (message, status = 400, code = 'partycrm_invalid_resource_calendar') =>
  Object.assign(new Error(message), { status, code })

export const getPartyResourceCalendarAccess = (context) => {
  const can = (resource) => canPartyAccess(context, { resource })
  const base = can('orders') && can('orders.eventDate') && can('orders.dateEnd')
  const types = []
  if (base && can('locations') && can('orders.locationId')) types.push({ id: 'location', title: 'Площадки' })
  if (base && can('staff') && can('orders.assignedStaff')) types.push({ id: 'staff', title: 'Сотрудники' })
  if (base && context?.company?.settings?.modules?.inventory?.enabled !== false &&
      ['inventory.catalog', 'inventory.stock', 'inventory.reservations'].every((resource) => canPartyInventoryAccess(context, { resource })))
    types.push({ id: 'inventory', title: 'Реквизит' })
  return { allowed: types.length > 0, types, tickets: isPartyTicketingEnabled(context?.company) && can('tickets') }
}

export const canPartyResourceCalendarAccess = (context) => getPartyResourceCalendarAccess(context).allowed

export const parsePartyResourceCalendarQuery = (params) => {
  if (['dateFrom', 'dateTo', 'type', 'resourceId', 'resourceSearch'].some((key) => params.getAll(key).length > 1) || params.has('calendarCursor'))
    throw partyResourceCalendarFailure('Укажите один диапазон и один вид ресурсов')
  const range = parsePartyOrderCalendarQuery(params)
  if (!range || +range.dateTo - +range.dateFrom > PARTY_RESOURCE_CALENDAR_MAX_RANGE_MS)
    throw partyResourceCalendarFailure('Выберите период не более 8 дней')
  const type = params.get('type') || 'location'
  const resourceId = params.get('resourceId') || ''
  const resourceSearch = (params.get('resourceSearch') || '').trim()
  if (resourceSearch.length > 120 || /[\u0000-\u001f\u007f]/.test(resourceSearch)) throw partyResourceCalendarFailure('Поиск ресурса должен содержать не более 120 символов без управляющих знаков')
  if (!['location', 'staff', 'inventory'].includes(type) || resourceId && !/^[a-f\d]{24}$/i.test(resourceId))
    throw partyResourceCalendarFailure('Некорректный вид или идентификатор ресурса')
  return { dateFrom: range.dateFrom, dateTo: range.dateTo, type, resourceId: resourceId.toLowerCase(), resourceSearch }
}

export const getPartyResourceCalendarLocationIds = (context) => {
  if (context?.role === 'owner' || context?.role === 'admin' && !context.position) return null
  const scope = context?.position?.orderScope?.locationIds
  if (context?.role === 'location_owner') return (context.staff?.locationIds || []).map(String).filter((value) => !scope?.length || scope.map(String).includes(value))
  return scope?.length ? scope.map(String) : null
}

// The same half-open windows and shared-order exemption as canonical booking.
// Only the authorized subset is checked; a false flag never promises availability.
export const markPartyResourceCalendarConflicts = ({ type, entries, resources }) => {
  const byResource = new Map(resources.map((resource) => [String(resource._id ?? resource.id), resource]))
  const groups = new Map()
  for (const entry of entries) {
    const rows = groups.get(entry.resourceId) || []
    rows.push(entry)
    groups.set(entry.resourceId, rows)
  }
  const marked = new Set()
  if (type === 'inventory') {
    const warnings = calculateInventoryAvailability({
      items: resources,
      demand: entries.map((entry) => ({ resourceId: entry.resourceId, serviceLineId: entry.id, quantity: entry.quantity, startAt: entry.start, endAt: entry.end })),
    }).warnings
    for (const warning of warnings) for (const entry of groups.get(String(warning.resourceId)) || []) {
      if (+new Date(entry.start) < +new Date(warning.endAt) && +new Date(entry.end) > +new Date(warning.startAt)) marked.add(entry.id)
    }
  } else {
    for (const [resourceId, rows] of groups) {
      const resource = byResource.get(resourceId) || {}
      for (let first = 0; first < rows.length; first += 1) {
        const entry = rows[first]
        const overlaps = rows.filter((other, index) => index !== first && partyVenueWindowsOverlap(entry, other))
        if (type === 'staff') {
          if (overlaps.some((other) => entry.orderId !== other.orderId)) marked.add(entry.id)
          continue
        }
        for (const other of overlaps) {
          if (entry.kind === 'order' && other.kind === 'order' && sharePartyLocationBooking(entry._source, other._source)) continue
          if (entry.kind === 'order' || other.kind === 'order' || resource.usageMode !== 'shared') marked.add(entry.id)
        }
        const tickets = overlaps.filter((row) => row.kind === 'ticket_session')
        if (entry.kind === 'ticket_session' && Number(resource.capacity) > 0 && entry.capacity > Number(resource.capacity)) marked.add(entry.id)
        if (entry.kind === 'ticket_session' && resource.usageMode === 'shared' && tickets.length &&
            (!Number(resource.capacity) || getPartyVenuePeakCapacity(entry, tickets) > Number(resource.capacity))) marked.add(entry.id)
      }
    }
  }
  return entries.map(({ _source: _privateSource, ...entry }) => ({ ...entry, conflict: marked.has(entry.id) }))
}
