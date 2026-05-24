const hasDateRange = (payload) => Boolean(payload?.eventDate && payload?.dateEnd)

const buildOverlapQuery = ({ tenantId, eventDate, dateEnd, excludeOrderId }) => {
  const conditions = {
    tenantId,
    status: { $nin: ['canceled', 'closed'] },
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

  if (payload.placeType === 'company_location' && payload.locationId) {
    conflictQueries.push(
      PartyOrders.find({
        ...overlapQuery,
        locationId: payload.locationId,
      })
        .select('_id title eventDate dateEnd locationId')
        .lean()
    )
  } else {
    conflictQueries.push(Promise.resolve([]))
  }

  const staffIds = (payload.assignedStaff ?? [])
    .map((item) => item.staffId)
    .filter(Boolean)

  if (staffIds.length > 0) {
    conflictQueries.push(
      PartyOrders.find({
        ...overlapQuery,
        'assignedStaff.staffId': { $in: staffIds },
      })
        .select('_id title eventDate dateEnd assignedStaff.staffId')
        .lean()
    )
  } else {
    conflictQueries.push(Promise.resolve([]))
  }

  const [locationConflicts, staffConflicts] = await Promise.all(conflictQueries)

  return {
    locationConflicts,
    staffConflicts,
  }
}

export const hasPartyOrderConflicts = (conflicts) =>
  Boolean(
    conflicts?.locationConflicts?.length || conflicts?.staffConflicts?.length
  )
