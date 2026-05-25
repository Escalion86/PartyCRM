import Users from '@models/Users'
import getUserTariffAccess from '@server/getUserTariffAccess'

export const isTelephonyTenantAllowed = async (tenantId) => {
  if (!tenantId) return false
  const owner = await Users.findById(tenantId).select('role').lean()
  return owner?.role === 'dev'
}

export const isTelephonyTariffAllowedForTenant = async (tenantId) => {
  if (!tenantId) return false
  const access = await getUserTariffAccess(tenantId)
  return Boolean(access?.allowTelephony)
}
