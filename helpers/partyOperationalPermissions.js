export const PARTY_OPERATIONAL_PERMISSIONS = Object.freeze([
  'inventory.movements',
  'orders.pricing',
  'orders.assignments',
])

export const normalizePartyOperationalPermissions = (permissions) =>
  Array.isArray(permissions)
    ? [
        ...new Set(
          permissions.filter((permission) =>
            PARTY_OPERATIONAL_PERMISSIONS.includes(permission)
          )
        ),
      ]
    : []

// Only company membership grants access. A global account role is not a grant.
export const canPartyOperationalPermission = (context, permission) => {
  if (!PARTY_OPERATIONAL_PERMISSIONS.includes(permission)) return false
  const staff = context?.staff
  if (
    !context?.tenantId ||
    !staff?.tenantId ||
    String(context.tenantId) !== String(staff.tenantId) ||
    staff.status !== 'active' ||
    context.role !== staff.role
  )
    return false
  if (['owner', 'admin'].includes(staff.role)) return true
  return (
    staff.role === 'performer' &&
    normalizePartyOperationalPermissions(staff.operationalPermissions).includes(
      permission
    )
  )
}
