import { getPartySessionUser } from './partyAuth'
import { getPartyCompanyModel, getPartyStaffModel } from './partyModels'

const sanitizeStaff = (staff) => {
  if (!staff) return null
  const data = typeof staff.toObject === 'function' ? staff.toObject() : staff
  return {
    ...data,
    _id: String(data._id),
    tenantId: data.tenantId ? String(data.tenantId) : null,
  }
}

const sanitizeCompany = (company) => {
  if (!company) return null
  const data =
    typeof company.toObject === 'function' ? company.toObject() : company
  return {
    ...data,
    _id: String(data._id),
    tenantId: data.tenantId ? String(data.tenantId) : null,
  }
}

const buildStaffQuery = (sessionUser) => {
  const authUserId = sessionUser?._id ? String(sessionUser._id) : ''

  return authUserId
    ? {
        status: { $ne: 'archived' },
        authUserId,
      }
    : null
}

const getPartyTenantContext = async () => {
  const sessionUser = await getPartySessionUser()
  const staffQuery = buildStaffQuery(sessionUser)

  if (!sessionUser?._id || !staffQuery) {
    return {
      session: null,
      sessionUser,
      staff: null,
      company: null,
      tenantId: null,
      role: null,
    }
  }

  const PartyStaff = await getPartyStaffModel()
  const PartyCompanies = await getPartyCompanyModel()
  const staff = await PartyStaff.findOne(staffQuery).lean()
  const tenantId = staff?.tenantId ? String(staff.tenantId) : null
  const company = tenantId
    ? await PartyCompanies.findOne({
        _id: tenantId,
        status: { $ne: 'archived' },
      }).lean()
    : null

  return {
    session: sessionUser ? { user: sessionUser } : null,
    sessionUser,
    staff: sanitizeStaff(staff),
    company: sanitizeCompany(company),
    tenantId: company?._id ? String(company._id) : null,
    role: staff?.role ?? null,
  }
}

export default getPartyTenantContext
