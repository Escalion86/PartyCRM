import { canPartyAccess } from './partyRolePermissions.js'

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
  if (staff.positionId || Number(context.position?.revision || 0) > 0) {
    const resource = { 'inventory.movements': 'inventory.movements', 'orders.pricing': 'finance.clientAmount', 'orders.assignments': 'orders.assignedStaff' }[permission]
    return canPartyAccess(context, { resource, action: 'edit' }) && canPartyAccess(context, { resource: permission === 'inventory.movements' ? 'inventory' : 'orders' })
  }
  if (['owner', 'admin'].includes(staff.role)) return true
  return (
    staff.role === 'performer' &&
    normalizePartyOperationalPermissions(staff.operationalPermissions).includes(
      permission
    )
  )
}
