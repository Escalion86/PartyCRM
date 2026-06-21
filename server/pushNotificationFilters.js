const cleanId = (value) => String(value ?? '').trim()

export const buildPushSubscriptionFindFilter = ({
  tenantId,
  product = '',
  targetUserId = '',
  allowCrossTenantUserTarget = false,
} = {}) => {
  const userId = cleanId(targetUserId)
  if (allowCrossTenantUserTarget && userId) {
    return {
      product,
      isActive: true,
      userId,
    }
  }

  const filter = {
    tenantId,
    isActive: true,
  }
  if (userId) filter.userId = userId
  return filter
}
