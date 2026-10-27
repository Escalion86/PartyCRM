const hasDateRange = (payload) =>
  Boolean(payload?.eventDate && payload?.dateEnd)

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

  const conflictQueries = []

  const conflictQuery = (filter, fields) => {
    const query = PartyOrders.find(filter).select(fields)
    return (session ? query.session(session) : query).lean()
  }
  if (
    checkLocation &&
    payload.placeType === 'company_location' &&
    payload.locationId
  ) {
    conflictQueries.push(
      conflictQuery(
        {
          ...overlapQuery,
          // Only IDs resolved from the stored tenant group by the caller are trusted.
          ...(excludeOrderId && sharedLocationOrderIds.length
            ? { _id: { $nin: [excludeOrderId, ...sharedLocationOrderIds] } }
            : {}),
          locationId: payload.locationId,
        },
        '_id title eventDate dateEnd locationId'
      )
    )
  } else {
    conflictQueries.push(Promise.resolve([]))
  }

  const staffIds = (payload.assignedStaff ?? [])
    .map((item) => item.staffId)
    .filter(Boolean)

  if (staffIds.length > 0) {
    conflictQueries.push(
      conflictQuery(
        {
          ...overlapQuery,
          'assignedStaff.staffId': { $in: staffIds },
        },
        '_id title eventDate dateEnd assignedStaff.staffId'
      )
    )
  } else {
    conflictQueries.push(Promise.resolve([]))
  }

  // MongoDB does not support parallel operations inside one transaction.
  const locationConflicts = await conflictQueries[0]
  const staffConflicts = await conflictQueries[1]

  return {
    locationConflicts,
    staffConflicts,
  }
}

export const hasPartyOrderConflicts = (conflicts) =>
  Boolean(
    conflicts?.locationConflicts?.length || conflicts?.staffConflicts?.length
  )
