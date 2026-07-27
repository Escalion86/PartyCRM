const idOf = (value) => String(value?._id ?? value?.id ?? value ?? '').trim()

const valueOf = (value) => {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(idOf).sort().join('|')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value ?? '').trim()
}

const assignmentByStaffId = (items) => {
  const map = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const staffId = idOf(item?.staffId)
    if (!staffId) continue
    map.set(staffId, item)
  }
  return map
}

const getStaff = (staffById, staffId) => {
  if (!staffById || !staffId) return null
  if (staffById instanceof Map) return staffById.get(staffId) || null
  return staffById[staffId] || null
}

const ORDER_CHANGE_FIELDS = [
  'title',
  'eventDate',
  'dateEnd',
  'placeType',
  'locationId',
  'customAddress',
  'serviceTitle',
  'servicesIds',
  'performerComment',
]

const ASSIGNMENT_CHANGE_FIELDS = ['role', 'confirmationStatus']

const hasVisibleOrderChanges = ({ previousOrder, nextOrder }) =>
  ORDER_CHANGE_FIELDS.some(
    (field) => valueOf(previousOrder?.[field]) !== valueOf(nextOrder?.[field])
  )

const hasVisibleAssignmentChanges = ({ previousAssignment, nextAssignment }) =>
  ASSIGNMENT_CHANGE_FIELDS.some(
    (field) =>
      valueOf(previousAssignment?.[field]) !== valueOf(nextAssignment?.[field])
  )

export const getPartyStaffPushUserId = (staff) =>
  String(staff?.authUserId || staff?.linkedAuthUserId || '').trim()

export const collectPartyPerformerAssignmentPushTargets = ({
  previousOrder = null,
  nextOrder = null,
  staffById = new Map(),
} = {}) => {
  if (!nextOrder) return []

  const previousAssignments = assignmentByStaffId(previousOrder?.assignedStaff)
  const nextAssignments = assignmentByStaffId(nextOrder.assignedStaff)
  const orderChanged =
    previousOrder && hasVisibleOrderChanges({ previousOrder, nextOrder })
  const targets = []

  for (const [staffId, nextAssignment] of nextAssignments) {
    const staff = getStaff(staffById, staffId)
    const userId = getPartyStaffPushUserId(staff)
    if (!userId) continue

    const previousAssignment = previousAssignments.get(staffId)
    if (!previousAssignment) {
      targets.push({ staffId, userId, changeType: 'new' })
      continue
    }

    if (
      orderChanged ||
      hasVisibleAssignmentChanges({ previousAssignment, nextAssignment })
    ) {
      targets.push({ staffId, userId, changeType: 'changed' })
    }
  }

  return targets
}
