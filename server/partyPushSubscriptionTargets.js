const idOf = (value) => String(value?._id ?? value?.id ?? value ?? '').trim()

export const getActivePartyPushMembershipTargets = (memberships = []) => {
  const seen = new Set()
  return (Array.isArray(memberships) ? memberships : [])
    .filter((membership) => membership?.role !== 'location_owner')
    .map((membership) => ({
      tenantId: idOf(membership?.tenantId),
      status: membership?.status || membership?.staff?.status || 'active',
    }))
    .filter((item) => {
      if (
        !item.tenantId ||
        item.status !== 'active' ||
        seen.has(item.tenantId)
      ) {
        return false
      }
      seen.add(item.tenantId)
      return true
    })
    .map(({ tenantId }) => ({ tenantId }))
}
