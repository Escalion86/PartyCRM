const idOf = (value) => String(value?._id ?? value?.id ?? value ?? '').trim()

export const getPartyStaffAccountId = (staff) =>
  String(staff?.authUserId || staff?.linkedAuthUserId || '').trim()

export const getInitialPartyAssignmentConfirmationStatus = (staff) =>
  getPartyStaffAccountId(staff) ? 'pending' : 'confirmed'

const CONFIRMATION_STATUSES = new Set([
  'pending',
  'confirmed',
  'declined',
  'done',
])

export const preservePartyAssignmentConfirmationStatuses = ({
  assignedStaff = [],
  previousAssignedStaff = [],
} = {}) => {
  const previousByStaffId = new Map(
    (Array.isArray(previousAssignedStaff) ? previousAssignedStaff : []).map(
      (item) => [idOf(item?.staffId), item]
    )
  )

  return (Array.isArray(assignedStaff) ? assignedStaff : []).map((assignment) => {
    if (CONFIRMATION_STATUSES.has(assignment?.confirmationStatus)) {
      return assignment
    }
    const previous = previousByStaffId.get(idOf(assignment?.staffId))
    return previous?.confirmationStatus
      ? { ...assignment, confirmationStatus: previous.confirmationStatus }
      : assignment
  })
}

export const applyPartyAssignmentConfirmationDefaults = ({
  assignedStaff = [],
  staff = [],
} = {}) => {
  const staffById = new Map(
    (Array.isArray(staff) ? staff : []).map((item) => [idOf(item), item])
  )

  return (Array.isArray(assignedStaff) ? assignedStaff : []).map(
    (assignment) => {
      const staffMember = staffById.get(idOf(assignment?.staffId))
      if (
        !staffMember ||
        getPartyStaffAccountId(staffMember) ||
        assignment?.confirmationStatus !== 'pending'
      ) {
        return assignment
      }

      return { ...assignment, confirmationStatus: 'confirmed' }
    }
  )
}
