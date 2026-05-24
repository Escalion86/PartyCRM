const isPageAllowedForRole = (accessRoles, role = 'user') => {
  if (!accessRoles || accessRoles.length === 0) return true
  return accessRoles.includes(role)
}

export default isPageAllowedForRole
