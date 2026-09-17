// For company pickers after access filtering, never for authorization context.
export const uniquePartyCompanyMemberships = (memberships = []) => {
  const seen = new Set()
  return memberships.filter((membership) => {
    const id = String(membership?.tenantId || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}
