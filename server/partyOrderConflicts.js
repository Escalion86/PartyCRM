const hasDateRange = (payload) =>
  Boolean(payload?.eventDate && payload?.dateEnd)

const assignmentWindow = (order, assignment) =>
  order.bookingVersion === 2 && assignment.placeId
    ? (order.places || []).find((place) => place.id === assignment.placeId)
    : order

const overlapsStaff = (order, other) => {
  if (order.bookingVersion !== 2 && other.bookingVersion !== 2) return true
  return (order.assignedStaff || []).some((assignment) => {
    const range = assignmentWindow(order, assignment)
    if (!hasDateRange(range)) return false
    return (other.assignedStaff || []).some((candidate) => {
      if (String(candidate.staffId) !== String(assignment.staffId)) return false
      const target = assignmentWindow(other, candidate)
      return hasDateRange(target) &&
        +new Date(range.eventDate) < +new Date(target.dateEnd) &&
        +new Date(range.dateEnd) > +new Date(target.eventDate)
    })
  })
}

// Lock existing employee documents in a consistent order. Venue locks alone
// cannot serialize bookings for one employee in different rooms.
const getPartyStaffScheduleModel = async () => (await import('./partyModels')).getPartyStaffModel()

export const withPartyOrderStaffSchedule = async ({
  tenantId,
  payload,
  session = null,
  work,
  getStaffModel = getPartyStaffScheduleModel,
}) => {
  const ids = [...new Set((payload.assignedStaff || [])
    .filter((assignment) => assignment.staffId && hasDateRange(assignmentWindow(payload, assignment)))
    .map((assignment) => String(assignment.staffId)))].sort()
  if (!ids.length || payload.status === 'canceled') return work(session)
  const Staff = await getStaffModel()
  const run = async (current) => {
    for (const id of ids) {
      await Staff.updateOne({ tenantId, _id: id }, { $inc: { orderScheduleRevision: 1 } }, { session: current, timestamps: false })
    }
    return work(current)
  }
  if (session) return run(session)
  const { supportsPartyVenueTransactions } = await import('./partyVenueBookings')
  if (!(await supportsPartyVenueTransactions(Staff))) {
    if (payload.bookingVersion === 2)
      throw Object.assign(new Error('Для назначения исполнителей необходима поддержка транзакций'), { status: 503, code: 'partycrm_venue_transaction_required' })
    return work(null)
  }
  const ownedSession = await Staff.db.startSession()
  try {
    return await ownedSession.withTransaction(() => run(ownedSession))
  } finally {
    await ownedSession.endSession()
  }
}

const buildOverlapQuery = ({
  tenantId,
  eventDate,
  dateEnd,
  excludeOrderId,
}) => {
  const conditions = {
    tenantId,
    status: { $ne: 'canceled' },
    eventDate: { $lt: dateEnd },
    dateEnd: { $gt: eventDate },
  }

  if (excludeOrderId) {
    conditions._id = { $ne: excludeOrderId }
  }

  return conditions
}

export const findPartyOrderConflicts = async ({
  PartyOrders,
  tenantId,
  payload,
  excludeOrderId = null,
  sharedLocationOrderIds = [],
  session = null,
  checkLocation = true,
}) => {
  if (!hasDateRange(payload)) {
    return {
      locationConflicts: [],
      staffConflicts: [],
    }
  }

  const overlapQuery = buildOverlapQuery({
    tenantId,
    eventDate: payload.eventDate,
    dateEnd: payload.dateEnd,
    excludeOrderId,
  })

  const conflictQuery = (filter, fields) => {
    const query = PartyOrders.find(filter).select(fields)
    return (session ? query.session(session) : query).lean()
  }
  const locationConflicts = (
    checkLocation &&
    payload.placeType === 'company_location' &&
    payload.locationId
  ) ? await conflictQuery(
        {
          ...overlapQuery,
          // Only IDs resolved from the stored tenant group by the caller are trusted.
          ...(excludeOrderId && sharedLocationOrderIds.length
            ? { _id: { $nin: [excludeOrderId, ...sharedLocationOrderIds] } }
            : {}),
          locationId: payload.locationId,
        },
        '_id title eventDate dateEnd locationId'
      ) : []

  const staffIds = (payload.assignedStaff ?? [])
    .map((item) => item.staffId)
    .filter(Boolean)

  const staffOrders = staffIds.length > 0 ? await conflictQuery(
        {
          ...overlapQuery,
          'assignedStaff.staffId': { $in: staffIds },
        },
        '_id title eventDate dateEnd assignedStaff.staffId assignedStaff.placeId bookingVersion places.id places.eventDate places.dateEnd'
      ) : []
  const staffConflicts = staffOrders.filter((order) => overlapsStaff(payload, order)).map(({ places: _places, ...order }) => order)

  return {
    locationConflicts,
    staffConflicts,
  }
}

export const hasPartyOrderConflicts = (conflicts) =>
  Boolean(
    conflicts?.locationConflicts?.length || conflicts?.staffConflicts?.length
  )
