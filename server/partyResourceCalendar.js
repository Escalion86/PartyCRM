import { canPartyAccess, buildPartyOrderAccessFilter, filterPartyOrderForAccess } from '../helpers/partyRolePermissions.js'
import {
  getPartyResourceCalendarAccess,
  getPartyResourceCalendarLocationIds,
  markPartyResourceCalendarConflicts,
  partyResourceCalendarFailure,
  PARTY_RESOURCE_CALENDAR_RESOURCE_LIMIT,
  PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT,
  PARTY_RESOURCE_CALENDAR_NOTICE,
} from '../helpers/partyResourceCalendar.js'
import { getPartyVenueWindow, PARTY_VENUE_MAX_BUFFER_MINUTES } from '../helpers/partyVenueBooking.js'

const id = (value) => String(value?._id ?? value ?? '')
const iso = (value) => new Date(value).toISOString()
const orderFields = '_id tenantId title serviceTitle status workflowStageId locationId eventDate dateEnd durationMinutes assignedStaff.staffId assignedStaff.confirmationStatus responsibleStaffId partyEventGroupId sharedLocationBooking'
const loadModels = async ({ type, includeTickets }) => {
  const models = await import('./partyModels')
  const Orders = await models.getPartyOrderModel()
  if (type === 'inventory') {
    const inventory = await import('./partyInventoryModels')
    return { Orders, Resources: await inventory.getPartyInventoryItemModel(), Reservations: await inventory.getPartyInventoryReservationModel() }
  }
  const result = { Orders, Resources: await (type === 'location' ? models.getPartyLocationModel() : models.getPartyStaffModel()) }
  if (includeTickets) {
    const [tickets, ticketing] = await Promise.all([import('./partyTicketModels'), import('./partyTicketing')])
    result.Sessions = await tickets.getPartyTicketSessionModel()
    result.ticketAccessFilter = ticketing.buildPartyTicketAccessFilter
  }
  return result
}

const rangeOverlap = (entry, range) =>
  +new Date(entry.occupiedFrom) < +range.dateTo && +new Date(entry.occupiedUntil) > +range.dateFrom
const titleOf = (context, order) => {
  const safe = filterPartyOrderForAccess(context, order)
  return safe?.title || safe?.serviceTitle || 'Заказ'
}
const href = (context, orderId) => `/performer/work?${new URLSearchParams({ companyId: id(context.tenantId), orderId: id(orderId) })}`
const windowOfOrder = (context, order, location = {}, venueLegacyDefault = false) => {
  // A missing end may only be derived from an authorized duration field.
  // Venue legacy reservations canonically use 60 minutes if duration is absent.
  let endsAt = order.dateEnd
  if (!endsAt) {
    if (order.durationMinutes && !canPartyAccess(context, { resource: 'orders.durationMinutes', order })) return null
    if (!venueLegacyDefault && !(Number(order.durationMinutes) > 0)) return null
    endsAt = new Date(+new Date(order.eventDate) + (Number(order.durationMinutes) || 60) * 60000)
  }
  try { return getPartyVenueWindow({ startsAt: order.eventDate, endsAt }, location) }
  catch { return null }
}
const serializeWindow = (window) => ({ start: iso(window.startsAt), end: iso(window.endsAt), occupiedFrom: iso(window.occupiedFrom), occupiedUntil: iso(window.occupiedUntil) })

// The fallback is the same duration used by venue legacy booking. The extended
// query horizon is bounded by the allowed configuration buffer, not a guessed
// event duration, so long-running events beginning before this week are included.
const orderIntervalFilter = (range, buffer = 0) => {
  const from = new Date(+range.dateFrom - buffer * 60000)
  const to = new Date(+range.dateTo + buffer * 60000)
  return {
    status: { $ne: 'canceled' }, eventDate: { $type: 'date', $lt: to },
    $or: [
      { dateEnd: { $gt: from } },
      { dateEnd: null, $expr: { $gt: [{ $add: ['$eventDate', { $multiply: [{ $cond: [{ $gt: ['$durationMinutes', 0] }, '$durationMinutes', 60] }, 60000] }] }, from] } },
    ],
  }
}

const inventoryRows = async ({ models, context, range, resourceIds }) => {
  const { Orders, Reservations } = models
  // Aggregations do not cast ObjectId strings. Let the real model schema cast
  // both the ordinary ACL filter and reservation references before the lookup.
  const accessQuery = Orders.find(buildPartyOrderAccessFilter(context))
  accessQuery.cast(Orders)
  const access = accessQuery.getFilter()
  const cast = (path, value) => Reservations.schema.path(path).cast(value)
  const rowMatch = { resourceId: { $in: resourceIds.map((value) => cast('rows.resourceId', value)) }, startAt: { $lt: range.dateTo }, endAt: { $gt: range.dateFrom } }
  const selected = Object.fromEntries(orderFields.split(' ').map((field) => [field, 1]))
  return Reservations.aggregate([
    { $match: { tenantId: cast('tenantId', context.tenantId), status: 'active', rows: { $elemMatch: rowMatch } } },
    { $unwind: '$rows' },
    { $match: Object.fromEntries(Object.entries(rowMatch).map(([field, value]) => [`rows.${field}`, value])) },
    { $lookup: { from: Orders.collection.name, let: { linkedOrderId: '$orderId' }, pipeline: [
      { $match: access },
      { $match: { status: { $ne: 'canceled' }, $expr: { $eq: ['$_id', '$$linkedOrderId'] } } },
      { $project: selected },
    ], as: 'visibleOrder' } },
    { $unwind: '$visibleOrder' },
    { $sort: { 'rows.startAt': 1, _id: 1, 'rows._id': 1 } },
    { $limit: PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT + 1 },
    { $project: { _id: 1, orderId: 1, row: '$rows', order: '$visibleOrder' } },
  ])
}

export const createPartyResourceCalendarService = ({ getModels = loadModels, now = () => new Date() } = {}) => {
  const load = async ({ context, query }) => {
    const access = getPartyResourceCalendarAccess(context)
    if (!access.allowed || !access.types.some((type) => type.id === query.type))
      throw partyResourceCalendarFailure('Нет доступа к этому виду ресурсов', 403, 'partycrm_resource_calendar_forbidden')
    const { type, resourceId, resourceSearch = '' } = query
    const models = await getModels({ type, includeTickets: type === 'location' && access.tickets })
    const locationIds = getPartyResourceCalendarLocationIds(context)
    const catalogFilter = {
      tenantId: context.tenantId, status: { $ne: 'archived' },
      ...(resourceId ? { _id: resourceId } : {}),
      ...(type === 'location' && locationIds ? { $and: [{ _id: { $in: locationIds } }] } : {}),
    }
    if (resourceSearch) {
      const literal = new RegExp(resourceSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      if (type === 'staff') catalogFilter.$or = [{ firstName: literal }, { secondName: literal }]
      else catalogFilter.title = literal
    }
    const catalogRows = await models.Resources.find(catalogFilter)
      .select(type === 'location' ? '_id title status capacity usageMode preparationMinutes cleanupMinutes' : type === 'staff' ? '_id firstName secondName status' : '_id title unit status quantity unavailableQuantity')
      .sort(type === 'staff' ? { firstName: 1, _id: 1 } : { title: 1, _id: 1 })
      .limit(PARTY_RESOURCE_CALENDAR_RESOURCE_LIMIT + 1).lean()
    if (resourceId && !catalogRows.length) throw partyResourceCalendarFailure('Ресурс не найден или недоступен', 404, 'partycrm_resource_not_found')
    const catalog = catalogRows.slice(0, PARTY_RESOURCE_CALENDAR_RESOURCE_LIMIT)
    const resourceIds = catalog.map((resource) => id(resource))
    const resourcesById = new Map(catalog.map((resource) => [id(resource), resource]))
    let partial = catalogRows.length > PARTY_RESOURCE_CALENDAR_RESOURCE_LIMIT
    let entries = []
    if (resourceIds.length && type === 'inventory') {
      const rows = await inventoryRows({ models, context, range: query, resourceIds })
      partial ||= rows.length > PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT
      const seen = new Set()
      for (const [rowIndex, value] of rows.slice(0, PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT).entries()) {
        const { row, order } = value
        const resource = resourcesById.get(id(row.resourceId))
        if (!resource || !canPartyAccess(context, { resource: 'orders', order })) continue
        if (!Number.isSafeInteger(row.quantity) || row.quantity < 1 || !row.startAt || !row.endAt || !Number.isFinite(+new Date(row.startAt)) || !Number.isFinite(+new Date(row.endAt)) || +new Date(row.endAt) <= +new Date(row.startAt)) { partial = true; continue }
        // Legacy rows may lack a subdocument id. A page-local ordinal is safer
        // than embedding the hidden service id/line id in a public React key.
        const key = `inventory:${id(value)}:${id(row._id) || rowIndex}`
        if (seen.has(key)) { partial = true; continue }
        seen.add(key)
        entries.push({ id: key, resourceId: id(row.resourceId), kind: 'inventory', title: titleOf(context, order), orderId: id(order), href: href(context, order._id), quantity: row.quantity, ...serializeWindow({ startsAt: row.startAt, endsAt: row.endAt, occupiedFrom: row.startAt, occupiedUntil: row.endAt }) })
      }
    } else if (resourceIds.length) {
      const buffer = PARTY_VENUE_MAX_BUFFER_MINUTES * 60000
      const [rows, sessions] = await Promise.all([models.Orders.find({ $and: [
        buildPartyOrderAccessFilter(context), orderIntervalFilter(query, type === 'location' ? PARTY_VENUE_MAX_BUFFER_MINUTES : 0),
        type === 'location' ? { locationId: { $in: resourceIds }, placeType: { $ne: 'client_address' } } : { 'assignedStaff.staffId': { $in: resourceIds } },
      ] }).select(orderFields).sort({ eventDate: 1, _id: 1 }).limit(PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT + 1).lean(),
      type === 'location' && access.tickets
        ? models.Sessions.find(models.ticketAccessFilter(context, { status: { $ne: 'canceled' }, locationId: { $in: resourceIds }, startsAt: { $lt: new Date(+query.dateTo + buffer) }, endsAt: { $gt: new Date(+query.dateFrom - buffer) } }))
          .select('_id title locationId startsAt endsAt capacity').sort({ startsAt: 1, _id: 1 }).limit(PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT + 1).lean()
        : Promise.resolve([]),
      ])
      partial ||= rows.length > PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT
      ordersLoop: for (const order of rows.slice(0, PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT)) {
        if (!canPartyAccess(context, { resource: 'orders', order })) continue
        const assignedIds = [...new Set((order.assignedStaff || []).map((assignment) => id(assignment.staffId)))].filter((value) => resourcesById.has(value))
        const targets = type === 'location' ? [id(order.locationId)] : assignedIds
        for (const target of targets) {
          const resource = resourcesById.get(target)
          if (!resource) continue
          const window = windowOfOrder(context, order, type === 'location' ? resource : {}, type === 'location')
          if (!window) { partial = true; continue }
          if (!rangeOverlap(window, query)) continue
          const assignment = type === 'staff' ? (order.assignedStaff || []).find((value) => id(value.staffId) === target) : null
          entries.push({ id: `order:${id(order)}:${target}`, resourceId: target, kind: 'order', orderId: id(order), title: titleOf(context, order), href: href(context, order._id), ...serializeWindow(window), ...(type === 'location' ? { bufferBeforeMinutes: Number(resource.preparationMinutes || 0), bufferAfterMinutes: Number(resource.cleanupMinutes || 0) } : { confirmationStatus: ['pending', 'confirmed', 'declined', 'done'].includes(assignment?.confirmationStatus) ? assignment.confirmationStatus : 'pending' }), _source: order })
          if (entries.length > PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT) { partial = true; break ordersLoop }
        }
      }
      if (type === 'location' && access.tickets) {
        partial ||= sessions.length > PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT
        for (const session of sessions.slice(0, PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT)) {
          const resource = resourcesById.get(id(session.locationId))
          if (!resource) continue
          if (!Number.isSafeInteger(session.capacity) || session.capacity < 1) { partial = true; continue }
          let window
          try { window = getPartyVenueWindow(session, resource) } catch { partial = true; continue }
          if (!rangeOverlap(window, query)) continue
          entries.push({ id: `session:${id(session)}`, resourceId: id(session.locationId), kind: 'ticket_session', sessionId: id(session), title: session.title || 'Билетный сеанс', href: `/performer/ticketing?${new URLSearchParams({ companyId: id(context.tenantId), sessionId: id(session) })}`, capacity: session.capacity, ...serializeWindow(window), bufferBeforeMinutes: Number(resource.preparationMinutes || 0), bufferAfterMinutes: Number(resource.cleanupMinutes || 0) })
        }
      }
    }
    entries.sort((first, second) => +new Date(first.occupiedFrom) - +new Date(second.occupiedFrom) || first.id.localeCompare(second.id))
    partial ||= entries.length > PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT
    const items = markPartyResourceCalendarConflicts({ type, entries, resources: catalog }).slice(0, PARTY_RESOURCE_CALENDAR_ENTRY_LIMIT)
    let timeZone = context.company?.settings?.timeZone || 'Europe/Moscow'
    try { new Intl.DateTimeFormat('en', { timeZone }).format(now()) } catch { timeZone = 'Europe/Moscow' }
    return {
      generatedAt: iso(now()), timeZone, dateFrom: iso(query.dateFrom), dateTo: iso(query.dateTo), type, resourceSearch, resourceTypes: access.types,
      resources: catalog.map((resource) => ({ id: id(resource), type, title: type === 'staff' ? [resource.firstName, resource.secondName].filter(Boolean).join(' ') || 'Сотрудник' : resource.title || (type === 'location' ? 'Площадка' : 'Реквизит'), status: resource.status, ...(type === 'location' ? { capacity: resource.capacity, usageMode: resource.usageMode || 'exclusive' } : type === 'inventory' ? { capacity: Math.max(0, Number(resource.quantity || 0) - Number(resource.unavailableQuantity || 0)), unit: resource.unit || 'шт.' } : {}) })),
      items, partial, hasMore: partial, notice: PARTY_RESOURCE_CALENDAR_NOTICE,
      ...(type === 'staff' ? { intervalNotice: 'Сотрудник назначен на весь интервал заказа. Отдельные интервалы участия в услугах пока не ведутся.' } : {}),
    }
  }
  return { load }
}

export const loadPartyResourceCalendar = (args) => createPartyResourceCalendarService().load(args)
